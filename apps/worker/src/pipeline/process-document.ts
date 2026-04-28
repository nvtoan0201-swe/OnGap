import { admin } from "../supabase/admin.js";
import { chunkMarkdown, type Chunk } from "../chunking/chunker.js";
import { extractBatch } from "../extraction/extract.js";
import type { Entry } from "../extraction/schemas.js";
import { initEmbedder, embedText } from "../embedding/embedder.js";
import { auditDocument } from "../audit/audit.js";
import { deriveFlashcards } from "../generation/flashcards.js";
import { logger } from "../logger.js";

const EXTRACT_BATCH_SIZE = 5;
const ENTRY_INSERT_BATCH = 50;

interface InsertedEntry {
  id: string;
  type: "concept" | "example" | "formula";
  payload_json: Record<string, unknown>;
  page_ref: number | null;
}

interface DocumentRow {
  id: string;
  subject_id: string;
  parsed_markdown: string | null;
}

interface InsertedChunk {
  id: string;
  heading_path: string;
  content_md: string;
}

/** pgvector accepts a text literal like '[0.1,0.2,…]'. */
function toVectorLiteral(arr: number[]): string {
  return JSON.stringify(arr);
}

/** Flatten an entry into a string used for its embedding. */
function entryToText(e: Entry): string {
  if (e.type === "concept") {
    return `${e.name}. ${e.definition_verbatim}`;
  }
  if (e.type === "example") {
    return `${e.description}. ${e.context}`.trim();
  }
  return `${e.expression}. ${e.variables} ${e.conditions}`.trim();
}

function importanceFor(e: Entry): number {
  return e.type === "concept" ? e.importance : 3;
}

async function setStatus(documentId: string, status: string, error?: string | null) {
  const sb = admin();
  await sb
    .from("documents")
    .update({
      status,
      error: error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
}

async function insertChunks(
  documentId: string,
  chunks: Chunk[],
): Promise<InsertedChunk[]> {
  if (chunks.length === 0) return [];
  const sb = admin();
  await initEmbedder();

  const rows: Array<Record<string, unknown>> = [];
  for (const c of chunks) {
    const vec = await embedText(c.contentMd);
    rows.push({
      document_id: documentId,
      heading_path: c.headingPath,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      content_md: c.contentMd,
      token_count: c.tokenCount,
      embedding: toVectorLiteral(vec),
    });
  }

  const { data, error } = await sb
    .from("chunks")
    .insert(rows)
    .select("id, heading_path, content_md");
  if (error) throw new Error(`chunks insert failed: ${error.message}`);
  return (data ?? []) as InsertedChunk[];
}

async function extractAndInsertEntries(
  documentId: string,
  subjectId: string,
  chunks: InsertedChunk[],
): Promise<InsertedEntry[]> {
  const sb = admin();
  const inserted: InsertedEntry[] = [];
  const rowBuffer: Array<Record<string, unknown>> = [];

  const flush = async () => {
    if (rowBuffer.length === 0) return;
    const snapshot = rowBuffer.slice();
    rowBuffer.length = 0;
    const { data, error } = await sb
      .from("entries")
      .insert(snapshot)
      .select("id, type, payload_json, page_ref");
    if (error) throw new Error(`entries insert failed: ${error.message}`);
    for (const row of (data ?? []) as InsertedEntry[]) inserted.push(row);
  };

  for (let i = 0; i < chunks.length; i += EXTRACT_BATCH_SIZE) {
    const slice = chunks.slice(i, i + EXTRACT_BATCH_SIZE);
    const batch = slice.map((c) => ({
      id: c.id,
      headingPath: c.heading_path,
      contentMd: c.content_md,
    }));
    const results = await extractBatch(batch);
    logger.info("extracted batch", {
      documentId,
      batchStart: i,
      batchSize: slice.length,
      entries: results.reduce((s, r) => s + r.entries.length, 0),
    });

    for (const r of results) {
      for (const entry of r.entries) {
        const vec = await embedText(entryToText(entry));
        rowBuffer.push({
          subject_id: subjectId,
          source_chunk_id: r.chunk_id,
          type: entry.type,
          payload_json: entry,
          importance: importanceFor(entry),
          page_ref: entry.page ?? null,
          embedding: toVectorLiteral(vec),
        });
        if (rowBuffer.length >= ENTRY_INSERT_BATCH) await flush();
      }
    }
  }
  await flush();
  return inserted;
}

/**
 * Runs chunk + extract + embed for a document whose `parsed_markdown` is
 * already populated. Advances status `parsed → chunking → extracting → done`.
 * On any error, sets status `failed` with the message and rethrows so the
 * caller (poller) can mark the job failed too.
 */
export async function processDocument(documentId: string): Promise<void> {
  const sb = admin();
  const { data: doc, error: loadErr } = await sb
    .from("documents")
    .select("id, subject_id, parsed_markdown")
    .eq("id", documentId)
    .single<DocumentRow>();
  if (loadErr || !doc) throw new Error(`document not found: ${documentId}`);
  if (!doc.parsed_markdown) throw new Error("parsed_markdown is empty");

  try {
    await setStatus(documentId, "chunking");
    const chunks = chunkMarkdown(doc.parsed_markdown);
    logger.info("chunked", { documentId, chunks: chunks.length });

    const inserted = await insertChunks(documentId, chunks);
    if (inserted.length === 0) {
      logger.warn("no chunks produced, marking done empty", { documentId });
      await setStatus(documentId, "done");
      return;
    }

    await setStatus(documentId, "extracting");
    const entries = await extractAndInsertEntries(
      documentId,
      doc.subject_id,
      inserted,
    );
    logger.info("extraction complete", {
      documentId,
      entries: entries.length,
    });

    await setStatus(documentId, "auditing");
    await auditDocument({
      documentId,
      subjectId: doc.subject_id,
      chunks: inserted.map((c) => ({ heading_path: c.heading_path })),
      entries,
    });

    const flashcards = await deriveFlashcards({
      documentId,
      subjectId: doc.subject_id,
      entries,
    });
    logger.info("flashcards complete", { documentId, flashcards });

    await setStatus(documentId, "done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("process failed", { documentId, err: msg });
    await setStatus(documentId, "failed", msg.slice(0, 2000));
    throw err;
  }
}

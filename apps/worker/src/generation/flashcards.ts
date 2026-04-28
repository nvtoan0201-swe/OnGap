import { admin } from "../supabase/admin.js";
import { logger } from "../logger.js";

export interface ConceptEntryRow {
  id: string;
  type: "concept" | "example" | "formula";
  payload_json: Record<string, unknown>;
  page_ref: number | null;
}

export interface DeriveInput {
  documentId: string;
  subjectId: string;
  entries: ConceptEntryRow[];
}

const INSERT_BATCH = 100;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 1 concept entry → 1 flashcard row. Pure SQL, no LLM. Skips entries that
 * already have a flashcard (idempotent on re-run). Returns inserted count.
 *
 * Field mapping:
 *   front           = payload.name
 *   back_verbatim   = payload.definition_verbatim
 *   back_paraphrase = null (Phase 5 generates LLM paraphrase)
 *   page_ref        = page_ref ?? payload.page ?? null
 *   difficulty      = clamp(payload.importance ?? 3, 1, 5)
 */
export async function deriveFlashcards(input: DeriveInput): Promise<number> {
  const { documentId, subjectId, entries } = input;
  const sb = admin();

  const concepts = entries.filter((e) => e.type === "concept");
  if (concepts.length === 0) {
    logger.info("no concept entries, skipping flashcards", { documentId });
    return 0;
  }

  const ids = concepts.map((e) => e.id);
  const { data: existing, error: selErr } = await sb
    .from("flashcards")
    .select("entry_id")
    .in("entry_id", ids);
  if (selErr) throw new Error(`flashcards select failed: ${selErr.message}`);
  const existingSet = new Set(
    ((existing ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id),
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const e of concepts) {
    if (existingSet.has(e.id)) continue;
    const p = e.payload_json as {
      name?: string;
      definition_verbatim?: string;
      importance?: number;
      page?: number | null;
    };
    if (!p.name || !p.definition_verbatim) {
      logger.warn("concept missing name/definition, skipping", {
        entryId: e.id,
      });
      continue;
    }
    rows.push({
      subject_id: subjectId,
      entry_id: e.id,
      front: p.name,
      back_verbatim: p.definition_verbatim,
      back_paraphrase: null,
      page_ref: e.page_ref ?? p.page ?? null,
      difficulty: clamp(p.importance ?? 3, 1, 5),
    });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await sb.from("flashcards").insert(batch);
    if (error) throw new Error(`flashcards insert failed: ${error.message}`);
    inserted += batch.length;
  }

  logger.info("flashcards derived", {
    documentId,
    inserted,
    skipped_existing: concepts.length - rows.length,
  });
  return inserted;
}

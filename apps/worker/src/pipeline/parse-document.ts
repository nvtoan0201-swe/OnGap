import { admin } from "../supabase/admin.js";
import { parseByMime, type SupportedMime } from "../parsers/index.js";
import { logger } from "../logger.js";

interface DocumentRow {
  id: string;
  subject_id: string;
  file_url: string;
  type: string;
}

function mimeFromPath(path: string): SupportedMime {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  throw new Error(`Unsupported file extension: ${path}`);
}

export async function parseDocument(documentId: string): Promise<void> {
  const sb = admin();

  const { data: doc, error: loadErr } = await sb
    .from("documents")
    .select("id, subject_id, file_url, type")
    .eq("id", documentId)
    .single<DocumentRow>();

  if (loadErr || !doc) throw new Error(`Document not found: ${documentId}`);

  await sb.from("documents")
    .update({ status: "parsing", updated_at: new Date().toISOString() })
    .eq("id", documentId);

  try {
    const { data: blob, error: dlErr } = await sb.storage
      .from("documents")
      .download(doc.file_url);
    if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message}`);
    const buf = Buffer.from(await blob.arrayBuffer());

    const mime = mimeFromPath(doc.file_url);
    const res = await parseByMime(mime, buf);
    logger.info("parsed", {
      documentId,
      pageCount: res.pageCount,
      chars: res.markdown.length,
      usedOcr: res.usedOcr,
    });

    await sb.from("documents")
      .update({
        status: "parsed",
        parsed_markdown: res.markdown,
        page_count: res.pageCount,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("parse failed", { documentId, err: msg });
    await sb.from("documents")
      .update({
        status: "failed",
        error: msg.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    throw err;
  }
}

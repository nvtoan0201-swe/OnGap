import { admin } from "../supabase/admin.js";
import { askClaude } from "../claude/client.js";
import { logger } from "../logger.js";
import { buildAuditPrompt, type EntrySummary, type OutlineEntry } from "./prompt.js";
import { AuditResponseSchema, type AuditGap } from "./schemas.js";

export interface AuditedEntry {
  type: "concept" | "example" | "formula";
  payload_json: Record<string, unknown>;
  page_ref: number | null;
}

export interface AuditInput {
  documentId: string;
  subjectId: string;
  chunks: Array<{ heading_path: string }>;
  entries: AuditedEntry[];
}

export interface AuditResult {
  coveragePct: number;
  gapsJson: AuditGap[];
}

function entryLabel(e: AuditedEntry): string {
  const p = e.payload_json as Record<string, unknown>;
  const candidate = p.name ?? p.expression ?? p.description ?? "?";
  return String(candidate).slice(0, 200);
}

function dedupOrdered(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/** Pull the first top-level `{...}` JSON object out of a Claude response. */
function extractJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Run a Sonnet 4.6 coverage audit and persist the result. Audit failure
 * (LLM error or malformed JSON) is logged but NOT fatal — we still write a
 * row with `coverage_pct = 0` and an empty gap list, so the document can
 * complete. Flashcard derivation runs regardless.
 */
export async function auditDocument(input: AuditInput): Promise<AuditResult> {
  const { documentId, subjectId, chunks, entries } = input;

  const outlinePaths = dedupOrdered(chunks.map((c) => c.heading_path));
  const outline: OutlineEntry[] = outlinePaths.map((p) => ({ heading_path: p }));
  const entrySummaries: EntrySummary[] = entries.map((e) => ({
    type: e.type,
    label: entryLabel(e),
    page: e.page_ref,
  }));

  let coveragePct = 0;
  let gapsJson: AuditGap[] = [];

  try {
    const prompt = buildAuditPrompt(outline, entrySummaries);
    const raw = await askClaude({ model: "sonnet", prompt, maxTurns: 1 });
    const json = extractJsonObject(raw);
    if (!json) throw new Error("no JSON object in audit response");
    const parsed = AuditResponseSchema.parse(JSON.parse(json));
    coveragePct = parsed.coverage_pct;
    gapsJson = parsed.gaps;
  } catch (err) {
    logger.warn("audit failed, recording 0 coverage and continuing", {
      documentId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const sb = admin();
  const { error } = await sb.from("coverage_audits").insert({
    subject_id: subjectId,
    document_id: documentId,
    outline_json: outline,
    gaps_json: gapsJson,
    coverage_pct: coveragePct,
  });
  if (error) {
    logger.error("coverage_audits insert failed", {
      documentId,
      err: error.message,
    });
  } else {
    logger.info("audit recorded", {
      documentId,
      coveragePct,
      gaps: gapsJson.length,
    });
  }

  return { coveragePct, gapsJson };
}

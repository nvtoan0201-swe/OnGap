import { askClaude } from "../claude/client.js";
import { logger } from "../logger.js";
import { buildExtractionPrompt, type PromptChunk } from "./prompt.js";
import { BatchExtractionSchema, type BatchExtraction } from "./schemas.js";

/** Pull the first top-level `[...]` JSON array out of a Claude response. */
function extractJsonArray(text: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

async function extractOnce(batch: PromptChunk[]): Promise<BatchExtraction> {
  const prompt = buildExtractionPrompt(batch);
  const raw = await askClaude({ model: "haiku", prompt, maxTurns: 1 });
  const json = extractJsonArray(raw);
  if (!json) throw new Error("no JSON array in extraction response");
  const parsed = JSON.parse(json);
  return BatchExtractionSchema.parse(parsed);
}

/**
 * Extract Concept/Example/Formula entries for a batch of up to ~5 chunks.
 * On parse/validation failure with batch size >1, splits in half and retries
 * (once per level). Batch of 1 that still fails returns an empty entries
 * list for that chunk so the rest of the document can proceed.
 */
export async function extractBatch(
  batch: PromptChunk[],
): Promise<BatchExtraction> {
  if (batch.length === 0) return [];
  try {
    return await extractOnce(batch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (batch.length === 1) {
      logger.warn("extraction failed for single chunk, skipping", {
        chunkId: batch[0]!.id,
        err: msg,
      });
      return [{ chunk_id: batch[0]!.id, entries: [] }];
    }
    logger.warn("extraction batch failed, splitting", {
      size: batch.length,
      err: msg,
    });
    const mid = Math.floor(batch.length / 2);
    const [a, b] = await Promise.all([
      extractBatch(batch.slice(0, mid)),
      extractBatch(batch.slice(mid)),
    ]);
    return [...a, ...b];
  }
}

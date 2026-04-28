/**
 * Approximate token count. Uses the standard ~4-chars/token heuristic.
 * Good enough for chunk-budget decisions; exact BPE count is not needed.
 */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

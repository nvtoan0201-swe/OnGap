import { describe, it, expect } from "vitest";
import { askClaude } from "./client.js";

describe("askClaude", () => {
  it("returns non-empty text from Haiku for a trivial prompt", async () => {
    const out = await askClaude({
      model: "haiku",
      prompt: "Say only the single word: pong",
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out.toLowerCase()).toContain("pong");
  }, 60_000);

  it("returns structured JSON for a schema-prompt via Sonnet", async () => {
    const out = await askClaude({
      model: "sonnet",
      prompt:
        'Respond ONLY with compact JSON: {"animal":"cat","legs":4}. No markdown, no prose.',
    });
    const cleaned = out.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    expect(parsed).toEqual({ animal: "cat", legs: 4 });
  }, 60_000);
});

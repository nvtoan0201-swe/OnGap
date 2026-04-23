import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";

// Mock the Claude client so this test runs offline and does not burn tokens.
vi.mock("../claude/client.js", () => ({
  askClaudeVision: vi.fn(async () => "Chuong 1: Kinh te vi mo\n\nDinh nghia: ..."),
}));

import { ocrPdf } from "./ocr.js";

describe("ocrPdf", () => {
  it("emits per-page markdown with page markers", async () => {
    const buf = readFileSync("test-fixtures/sample-text.pdf");
    const res = await ocrPdf(buf);
    expect(res.pageCount).toBeGreaterThanOrEqual(1);
    expect(res.markdown).toMatch(/<!-- page:\s*1 -->/);
    expect(res.markdown).toContain("Kinh te vi mo");
    expect(res.totalChars).toBeGreaterThan(0);
  }, 60_000);
});

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parsePdf } from "./pdf.js";

describe("parsePdf", () => {
  it("extracts text and page count from a small text PDF", async () => {
    const buf = readFileSync("test-fixtures/sample-text.pdf");
    const res = await parsePdf(buf);
    expect(res.pageCount).toBeGreaterThanOrEqual(2);
    expect(res.markdown).toContain("Kinh te vi mo");
    expect(res.markdown).toContain("Cung thi truong");
    expect(res.totalChars).toBeGreaterThan(50);
  });

  it("inserts page markers between pages", async () => {
    const buf = readFileSync("test-fixtures/sample-text.pdf");
    const res = await parsePdf(buf);
    expect(res.markdown).toMatch(/<!-- page:\s*2 -->/);
  });
});

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parsePptx } from "./pptx.js";

describe("parsePptx", () => {
  it("extracts slide text with per-slide page markers", async () => {
    const buf = readFileSync("test-fixtures/sample.pptx");
    const res = await parsePptx(buf);
    expect(res.pageCount).toBeGreaterThanOrEqual(2);
    expect(res.markdown).toContain("Chuong 1: Cau");
    expect(res.markdown).toContain("Chuong 2: Cung");
    expect(res.markdown).toMatch(/<!-- page:\s*1 -->/);
    expect(res.markdown).toMatch(/<!-- page:\s*2 -->/);
  });
});

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseDocx } from "./docx.js";

describe("parseDocx", () => {
  it("converts DOCX to markdown preserving headings", async () => {
    const buf = readFileSync("test-fixtures/sample.docx");
    const res = await parseDocx(buf);
    expect(res.markdown).toMatch(/^# De cuong on tap/m);
    expect(res.markdown).toMatch(/^# Phan B/m);
    expect(res.markdown).toContain("cau thi truong");
    expect(res.totalChars).toBeGreaterThan(20);
  });
});

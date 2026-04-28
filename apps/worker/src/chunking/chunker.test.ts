import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "./chunker.js";

describe("chunkMarkdown", () => {
  it("splits at H2 boundaries and captures heading path + page range", () => {
    const md = [
      "<!-- page: 1 -->",
      "",
      "# Chương 1",
      "",
      "## 1.1 Khái niệm",
      "",
      "Đây là phần giới thiệu. ".repeat(60),
      "",
      "<!-- page: 2 -->",
      "",
      "Đoạn tiếp theo vẫn trong 1.1. ".repeat(60),
      "",
      "## 1.2 Ví dụ",
      "",
      "<!-- page: 3 -->",
      "",
      "Đoạn ví dụ cụ thể. ".repeat(60),
    ].join("\n");

    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.headingPath).toBe("Chương 1 > 1.1 Khái niệm");
    expect(chunks[0]!.pageFrom).toBe(1);
    expect(chunks[0]!.pageTo).toBe(2);
    expect(chunks[1]!.headingPath).toBe("Chương 1 > 1.2 Ví dụ");
    // The 1.2 heading itself appears on page 2 (last seen marker), the
    // content body then rolls into page 3. Both pages belong to the section.
    expect(chunks[1]!.pageFrom).toBe(2);
    expect(chunks[1]!.pageTo).toBe(3);
  });

  it("splits oversized sections with paragraph overlap", () => {
    const big = ("Một đoạn văn dài ".repeat(40) + "\n\n").repeat(40);
    const md = [
      "<!-- page: 1 -->",
      "",
      "# Chương 2",
      "",
      "## 2.1 Nội dung khổng lồ",
      "",
      big,
    ].join("\n");

    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(3000);
      expect(c.headingPath).toBe("Chương 2 > 2.1 Nội dung khổng lồ");
    }
    // Overlap: the last paragraph(s) of chunk 0 should appear again at the
    // start of chunk 1 body (they were carried as overlap prefix).
    const firstTail = chunks[0]!.contentMd.trim().split(/\n{2,}/).slice(-1)[0]!;
    const secondHead = chunks[1]!.contentMd.trim().split(/\n{2,}/)[0]!;
    expect(secondHead).toBe(firstTail);
  });

  it("returns one (toàn văn) chunk when there are no headings", () => {
    const md = "Đoạn văn không có heading nào.\n\nDòng thứ hai.";
    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.headingPath).toBe("(toàn văn)");
    expect(chunks[0]!.contentMd).toContain("Đoạn văn");
  });

  it("keeps each H2 as its own chunk even when small", () => {
    const md = [
      "# Chương 3",
      "",
      "## 3.1 Phần chính",
      "",
      "Nội dung chính. ".repeat(200),
      "",
      "## 3.2 Ghi chú",
      "",
      "Ngắn.",
    ].join("\n");
    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.headingPath).toBe("Chương 3 > 3.1 Phần chính");
    expect(chunks[1]!.headingPath).toBe("Chương 3 > 3.2 Ghi chú");
    expect(chunks[1]!.contentMd.trim()).toBe("Ngắn.");
  });
});

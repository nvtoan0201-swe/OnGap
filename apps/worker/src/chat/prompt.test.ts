import { describe, it, expect } from "vitest";
import { buildChatPrompt, hitSnippet, hitsToCitations, type ChatHit } from "./prompt.js";

const conceptHit = (over: Partial<ChatHit> = {}): ChatHit => ({
  id: "e1",
  type: "concept",
  payload_json: { name: "Đệ quy", definition_verbatim: "Là kỹ thuật gọi lại chính nó." },
  page_ref: 12,
  heading_path: "Chương 2 > Đệ quy",
  similarity: 0.9,
  ...over,
});

const formulaHit = (over: Partial<ChatHit> = {}): ChatHit => ({
  id: "e2",
  type: "formula",
  payload_json: { expression: "T(n) = T(n-1) + n", variables: "n: số phần tử" },
  page_ref: 18,
  heading_path: "Chương 2 > Hàm sinh",
  similarity: 0.7,
  ...over,
});

describe("hitSnippet", () => {
  it("formats concept as name + definition", () => {
    expect(hitSnippet(conceptHit())).toBe("Đệ quy: Là kỹ thuật gọi lại chính nó.");
  });

  it("formats formula as expression | variables", () => {
    expect(hitSnippet(formulaHit())).toBe("T(n) = T(n-1) + n | n: số phần tử");
  });

  it("formats example as description — context", () => {
    const h = conceptHit({
      type: "example",
      payload_json: { description: "Tính giai thừa", context: "Dùng đệ quy" },
    });
    expect(hitSnippet(h)).toBe("Tính giai thừa — Dùng đệ quy");
  });

  it("falls back to (rỗng) when payload empty", () => {
    expect(hitSnippet(conceptHit({ payload_json: {} }))).toBe("(rỗng)");
  });
});

describe("buildChatPrompt", () => {
  it("includes verbatim rule + citation rule + numbered context blocks + the query", () => {
    const prompt = buildChatPrompt("Đệ quy là gì?", [conceptHit(), formulaHit()]);
    expect(prompt).toContain("Trích dẫn nguyên văn (verbatim)");
    expect(prompt).toContain("Không tìm thấy trong tài liệu.");
    expect(prompt).toContain("[1] (khái niệm, trang 12 — Chương 2 > Đệ quy)");
    expect(prompt).toContain("[2] (công thức, trang 18 — Chương 2 > Hàm sinh)");
    expect(prompt).toContain("Câu hỏi: Đệ quy là gì?");
    expect(prompt).toContain("Trả lời (tiếng Việt");
  });

  it("handles missing page_ref with 'không rõ trang'", () => {
    const prompt = buildChatPrompt("hỏi", [conceptHit({ page_ref: null })]);
    expect(prompt).toContain("không rõ trang");
  });
});

describe("hitsToCitations", () => {
  it("maps each hit to a citation with truncated snippet", () => {
    const longSnippet = "x".repeat(500);
    const hits = [
      conceptHit({ payload_json: { name: "A", definition_verbatim: longSnippet } }),
    ];
    const cits = hitsToCitations(hits);
    expect(cits).toHaveLength(1);
    expect(cits[0]!.page).toBe(12);
    expect(cits[0]!.heading_path).toBe("Chương 2 > Đệ quy");
    expect(cits[0]!.snippet.length).toBeLessThanOrEqual(240);
    expect(cits[0]!.type).toBe("concept");
  });
});

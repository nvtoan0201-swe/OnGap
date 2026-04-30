export interface ChatHit {
  id: string;
  type: "concept" | "example" | "formula";
  payload_json: Record<string, unknown>;
  page_ref: number | null;
  heading_path: string;
  similarity: number;
}

const TYPE_LABEL: Record<ChatHit["type"], string> = {
  concept: "khái niệm",
  example: "ví dụ",
  formula: "công thức",
};

/** Pull a verbatim snippet out of an entry's payload by type. */
export function hitSnippet(hit: ChatHit): string {
  const p = hit.payload_json;
  if (hit.type === "concept") {
    const name = String(p.name ?? "");
    const def = String(p.definition_verbatim ?? "");
    return name && def ? `${name}: ${def}` : def || name || "(rỗng)";
  }
  if (hit.type === "example") {
    const desc = String(p.description ?? "");
    const ctx = String(p.context ?? "");
    return [desc, ctx].filter(Boolean).join(" — ") || "(rỗng)";
  }
  // formula
  const expr = String(p.expression ?? "");
  const vars = String(p.variables ?? "");
  return [expr, vars].filter(Boolean).join(" | ") || "(rỗng)";
}

function citationLabel(hit: ChatHit): string {
  const page = hit.page_ref != null ? `trang ${hit.page_ref}` : "không rõ trang";
  return `${page} — ${hit.heading_path}`;
}

export function buildChatPrompt(query: string, hits: ChatHit[]): string {
  const blocks = hits.map((h, i) => {
    const idx = i + 1;
    return `[${idx}] (${TYPE_LABEL[h.type]}, ${citationLabel(h)})\n   ${hitSnippet(h)}`;
  });

  return [
    "Bạn là trợ lý ôn thi cho sinh viên Việt Nam.",
    "",
    "Quy tắc:",
    '1. CHỈ dùng thông tin trong "Ngữ cảnh" bên dưới. Nếu không có hoặc không liên quan, trả lời chính xác: "Không tìm thấy trong tài liệu."',
    "2. Trích dẫn nguyên văn (verbatim) — KHÔNG diễn giải lại bằng từ khác.",
    "3. Sau mỗi ý, ghi `[trang N — heading]` đúng theo Ngữ cảnh.",
    "4. KHÔNG dùng kiến thức ngoài Ngữ cảnh.",
    "",
    "Ngữ cảnh:",
    blocks.join("\n\n"),
    "",
    `Câu hỏi: ${query}`,
    "",
    "Trả lời (tiếng Việt, có trích dẫn):",
  ].join("\n");
}

export interface Citation {
  page: number | null;
  heading_path: string;
  type: ChatHit["type"];
  snippet: string;
}

export function hitsToCitations(hits: ChatHit[]): Citation[] {
  return hits.map((h) => ({
    page: h.page_ref,
    heading_path: h.heading_path,
    type: h.type,
    snippet: hitSnippet(h).slice(0, 240),
  }));
}

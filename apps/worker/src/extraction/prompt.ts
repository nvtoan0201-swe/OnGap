export interface PromptChunk {
  id: string;
  headingPath: string;
  contentMd: string;
}

const SYSTEM = `Bạn là chuyên gia trích xuất kiến thức từ tài liệu học thuật tiếng Việt. Với MỖI đoạn tài liệu (chunk) bên dưới, trích xuất TẤT CẢ ba loại mục sau:

- concept: khái niệm / định nghĩa. GIỮ NGUYÊN VĂN câu định nghĩa nếu có.
- example: ví dụ, case study, tình huống minh họa.
- formula: công thức, số liệu, quy tắc, mô hình.

Nguyên tắc tuyệt đối:
- KHÔNG tóm tắt. KHÔNG paraphrase thuật ngữ. Giữ nguyên văn.
- KHÔNG bỏ sót. Một chunk có thể có nhiều concept/example/formula — liệt kê hết.
- Nếu chunk không chứa loại nào đó → bỏ qua loại đó (không tạo entry giả).
- "page" là số trang nguồn (số nguyên) nếu đoạn văn kèm marker \`<!-- page: N -->\`; nếu không chắc, để null.

Trả về DUY NHẤT một JSON array (không markdown fence, không giải thích thêm), theo schema:
[
  {
    "chunk_id": "<id của chunk>",
    "entries": [
      { "type": "concept", "name": "...", "definition_verbatim": "...", "importance": 3, "related": [], "page": 1 },
      { "type": "example", "description": "...", "context": "...", "concept_ref": "...", "page": 1 },
      { "type": "formula", "expression": "...", "variables": "...", "conditions": "...", "page": 1 }
    ]
  }
]`;

export function buildExtractionPrompt(chunks: PromptChunk[]): string {
  const body = chunks
    .map(
      (c) =>
        `<chunk id="${c.id}" heading="${c.headingPath.replace(/"/g, "'")}">\n${c.contentMd}\n</chunk>`,
    )
    .join("\n\n");
  return `${SYSTEM}\n\n--- CHUNKS ---\n\n${body}\n\n--- HẾT ---\nXuất JSON array ngay bây giờ.`;
}

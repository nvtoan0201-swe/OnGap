export interface OutlineEntry {
  heading_path: string;
}

export interface EntrySummary {
  type: "concept" | "example" | "formula";
  label: string;
  page: number | null;
}

const SYSTEM = `Bạn là người kiểm thính chất lượng cho pipeline trích xuất kiến thức từ tài liệu học thuật tiếng Việt.

Tôi đưa cho bạn:
1. OUTLINE — danh sách heading path của tài liệu (theo thứ tự xuất hiện).
2. ENTRIES — danh sách concept/example/formula đã được trích xuất.

Nhiệm vụ: kiểm tra heading nào KHÔNG có entry tương ứng (gap).

Quy tắc:
- coverage_pct (số 0..100) = (số heading có ≥1 entry liên quan) / (tổng số heading) × 100, làm tròn 2 chữ số thập phân.
- Một heading "có entry" nếu ít nhất 1 entry rõ ràng nói về cùng chủ đề (không cần khớp 1-1 vị trí).
- gaps[].heading_path phải là heading lấy nguyên văn từ OUTLINE.
- gaps[].reason: 1 câu ngắn nói thiếu cái gì.
- KHÔNG suy đoán nội dung không có trong ENTRIES.

Trả về DUY NHẤT một JSON object (không markdown fence, không giải thích thêm), theo schema:
{
  "coverage_pct": 92.5,
  "gaps": [{ "heading_path": "Chương 1 > 1.2 X", "reason": "..." }],
  "notes": ""
}`;

export function buildAuditPrompt(
  outline: OutlineEntry[],
  entries: EntrySummary[],
): string {
  const outlineBody = outline.length
    ? outline.map((o, i) => `${i + 1}. ${o.heading_path}`).join("\n")
    : "(không có heading)";
  const entriesBody = JSON.stringify(entries, null, 2);
  return `${SYSTEM}\n\n--- OUTLINE ---\n${outlineBody}\n\n--- ENTRIES ---\n${entriesBody}\n\n--- HẾT ---\nXuất JSON object ngay bây giờ.`;
}

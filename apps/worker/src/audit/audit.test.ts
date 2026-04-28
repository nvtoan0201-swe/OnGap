import { describe, it, expect, vi, beforeEach } from "vitest";

const { askClaudeMock, adminMock } = vi.hoisted(() => ({
  askClaudeMock: vi.fn<(arg: unknown) => Promise<string>>(),
  adminMock: vi.fn(),
}));

vi.mock("../claude/client.js", () => ({ askClaude: askClaudeMock }));
vi.mock("../supabase/admin.js", () => ({ admin: adminMock }));

import { auditDocument } from "./audit.js";

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}

function makeFakeSb() {
  const inserts: InsertCall[] = [];
  const from = (table: string) => ({
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return Promise.resolve({ data: null, error: null });
    },
  });
  return { sb: { from }, inserts };
}

const sampleInput = () => ({
  documentId: "doc-1",
  subjectId: "subj-1",
  chunks: [
    { heading_path: "Chương 1 > 1.1 A" },
    { heading_path: "Chương 1 > 1.1 A" }, // duplicate, dedup expected
    { heading_path: "Chương 1 > 1.2 B" },
  ],
  entries: [
    {
      type: "concept" as const,
      payload_json: { name: "Cầu", definition_verbatim: "..." },
      page_ref: 1,
    },
    {
      type: "formula" as const,
      payload_json: { expression: "Q=a-bP" },
      page_ref: 2,
    },
  ],
});

describe("auditDocument", () => {
  beforeEach(() => {
    askClaudeMock.mockReset();
    adminMock.mockReset();
  });

  it("parses Sonnet JSON, persists row, returns parsed values", async () => {
    const { sb, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    askClaudeMock.mockResolvedValueOnce(
      JSON.stringify({
        coverage_pct: 92.5,
        gaps: [{ heading_path: "Chương 1 > 1.2 B", reason: "thiếu khái niệm" }],
        notes: "",
      }),
    );

    const out = await auditDocument(sampleInput());
    expect(out.coveragePct).toBe(92.5);
    expect(out.gapsJson).toHaveLength(1);

    const row = inserts.find((i) => i.table === "coverage_audits")!.row;
    expect(row.subject_id).toBe("subj-1");
    expect(row.document_id).toBe("doc-1");
    expect(row.coverage_pct).toBe(92.5);
    // outline_json is deduped
    expect((row.outline_json as Array<{ heading_path: string }>).map((o) => o.heading_path))
      .toEqual(["Chương 1 > 1.1 A", "Chương 1 > 1.2 B"]);
  });

  it("LLM throw → records 0 coverage, empty gaps, still inserts row", async () => {
    const { sb, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    askClaudeMock.mockRejectedValueOnce(new Error("rate limit"));

    const out = await auditDocument(sampleInput());
    expect(out.coveragePct).toBe(0);
    expect(out.gapsJson).toEqual([]);
    const row = inserts.find((i) => i.table === "coverage_audits")!.row;
    expect(row.coverage_pct).toBe(0);
    expect(row.gaps_json).toEqual([]);
  });

  it("malformed JSON → still graceful", async () => {
    const { sb, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    askClaudeMock.mockResolvedValueOnce("not a JSON object at all");

    const out = await auditDocument(sampleInput());
    expect(out.coveragePct).toBe(0);
    expect(inserts).toHaveLength(1);
  });
});

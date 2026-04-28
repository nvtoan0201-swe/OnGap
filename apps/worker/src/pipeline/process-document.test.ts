import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  adminMock,
  chunkMarkdownMock,
  extractBatchMock,
  embedTextMock,
  initEmbedderMock,
  auditDocumentMock,
  deriveFlashcardsMock,
} = vi.hoisted(() => ({
  adminMock: vi.fn(),
  chunkMarkdownMock: vi.fn(),
  extractBatchMock: vi.fn(),
  embedTextMock: vi.fn<(t: string) => Promise<number[]>>(),
  initEmbedderMock: vi.fn(async () => {}),
  auditDocumentMock: vi.fn(),
  deriveFlashcardsMock: vi.fn(),
}));

vi.mock("../supabase/admin.js", () => ({ admin: adminMock }));
vi.mock("../chunking/chunker.js", () => ({ chunkMarkdown: chunkMarkdownMock }));
vi.mock("../extraction/extract.js", () => ({ extractBatch: extractBatchMock }));
vi.mock("../embedding/embedder.js", () => ({
  initEmbedder: initEmbedderMock,
  embedText: embedTextMock,
}));
vi.mock("../audit/audit.js", () => ({ auditDocument: auditDocumentMock }));
vi.mock("../generation/flashcards.js", () => ({
  deriveFlashcards: deriveFlashcardsMock,
}));

import { processDocument } from "./process-document.js";

interface FakeBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeFakeSb() {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; rows: Array<Record<string, unknown>> }> =
    [];

  const chunksRows = [
    { id: "c-uuid-1", heading_path: "H1 > A", content_md: "AAA" },
    { id: "c-uuid-2", heading_path: "H1 > B", content_md: "BBB" },
  ];

  const from = (table: string) => {
    const builder: FakeBuilder = {
      select: vi.fn().mockImplementation(() => builder),
      eq: vi.fn().mockImplementation(() => builder),
      single: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    if (table === "documents") {
      builder.single.mockResolvedValue({
        data: {
          id: "doc-1",
          subject_id: "subj-1",
          parsed_markdown: "# H1\n\n## A\n\naaa\n\n## B\n\nbbb",
        },
        error: null,
      });
      builder.update.mockImplementation((patch: Record<string, unknown>) => {
        updates.push({ table, patch });
        return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });
    } else if (table === "chunks") {
      builder.insert.mockImplementation((rows: Array<Record<string, unknown>>) => {
        inserts.push({ table, rows });
        return {
          select: vi
            .fn()
            .mockResolvedValue({ data: chunksRows, error: null }),
        };
      });
    } else if (table === "entries") {
      builder.insert.mockImplementation((rows: Array<Record<string, unknown>>) => {
        inserts.push({ table, rows });
        // Phase 4 needs `.select()` to return inserted rows for audit + flashcards.
        const echoed = rows.map((r, i) => ({
          id: `e-uuid-${inserts.length}-${i}`,
          type: r.type,
          payload_json: r.payload_json,
          page_ref: r.page_ref,
        }));
        return {
          select: vi
            .fn()
            .mockResolvedValue({ data: echoed, error: null }),
        };
      });
    }
    return builder;
  };

  return { sb: { from }, updates, inserts };
}

describe("processDocument", () => {
  beforeEach(() => {
    adminMock.mockReset();
    chunkMarkdownMock.mockReset();
    extractBatchMock.mockReset();
    embedTextMock.mockReset();
    initEmbedderMock.mockReset();
    auditDocumentMock.mockReset();
    deriveFlashcardsMock.mockReset();
    embedTextMock.mockImplementation(async () => Array(768).fill(0.01));
    auditDocumentMock.mockResolvedValue({ coveragePct: 95, gapsJson: [] });
    deriveFlashcardsMock.mockResolvedValue(1);
  });

  function primeChunkAndExtract() {
    chunkMarkdownMock.mockReturnValue([
      {
        headingPath: "H1 > A",
        pageFrom: 1,
        pageTo: 1,
        contentMd: "AAA",
        tokenCount: 1,
      },
      {
        headingPath: "H1 > B",
        pageFrom: 2,
        pageTo: 2,
        contentMd: "BBB",
        tokenCount: 1,
      },
    ]);
    extractBatchMock.mockResolvedValue([
      {
        chunk_id: "c-uuid-1",
        entries: [
          {
            type: "concept",
            name: "X",
            definition_verbatim: "X is Y",
            importance: 4,
            related: [],
            page: 1,
          },
        ],
      },
      {
        chunk_id: "c-uuid-2",
        entries: [
          {
            type: "formula",
            expression: "a=b",
            variables: "",
            conditions: "",
            page: 2,
          },
        ],
      },
    ]);
  }

  it("runs chunk → extract → audit → flashcards → done with correct status flow", async () => {
    const { sb, updates, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    primeChunkAndExtract();

    await processDocument("doc-1");

    const statuses = updates
      .filter((u) => u.table === "documents")
      .map((u) => u.patch.status);
    expect(statuses).toEqual(["chunking", "extracting", "auditing", "done"]);

    expect(auditDocumentMock).toHaveBeenCalledTimes(1);
    expect(deriveFlashcardsMock).toHaveBeenCalledTimes(1);

    // Audit received chunks + entries from extraction.
    const auditCall = auditDocumentMock.mock.calls[0]![0];
    expect(auditCall.documentId).toBe("doc-1");
    expect(auditCall.subjectId).toBe("subj-1");
    expect(auditCall.entries).toHaveLength(2);
    expect(auditCall.chunks).toEqual([
      { heading_path: "H1 > A" },
      { heading_path: "H1 > B" },
    ]);

    // Flashcards received same entry rows.
    const flashCall = deriveFlashcardsMock.mock.calls[0]![0];
    expect(flashCall.entries).toHaveLength(2);
    expect(flashCall.subjectId).toBe("subj-1");

    // Entries insert still happens (sanity).
    const entryInsert = inserts.find((i) => i.table === "entries")!;
    expect(entryInsert.rows).toHaveLength(2);
  });

  it("sets status failed when chunker throws", async () => {
    const { sb, updates } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    chunkMarkdownMock.mockImplementation(() => {
      throw new Error("bad chunker");
    });

    await expect(processDocument("doc-1")).rejects.toThrow("bad chunker");
    const lastStatus = updates
      .filter((u) => u.table === "documents")
      .map((u) => u.patch.status)
      .pop();
    expect(lastStatus).toBe("failed");
  });

  it("flashcard failure marks document failed", async () => {
    const { sb, updates } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    primeChunkAndExtract();
    deriveFlashcardsMock.mockRejectedValueOnce(new Error("flashcards db down"));

    await expect(processDocument("doc-1")).rejects.toThrow("flashcards db down");
    const statuses = updates
      .filter((u) => u.table === "documents")
      .map((u) => u.patch.status);
    expect(statuses).toContain("auditing");
    expect(statuses[statuses.length - 1]).toBe("failed");
  });
});

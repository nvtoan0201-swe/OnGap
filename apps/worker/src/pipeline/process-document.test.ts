import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock, chunkMarkdownMock, extractBatchMock, embedTextMock, initEmbedderMock } =
  vi.hoisted(() => ({
    adminMock: vi.fn(),
    chunkMarkdownMock: vi.fn(),
    extractBatchMock: vi.fn(),
    embedTextMock: vi.fn<(t: string) => Promise<number[]>>(),
    initEmbedderMock: vi.fn(async () => {}),
  }));

vi.mock("../supabase/admin.js", () => ({ admin: adminMock }));
vi.mock("../chunking/chunker.js", () => ({ chunkMarkdown: chunkMarkdownMock }));
vi.mock("../extraction/extract.js", () => ({ extractBatch: extractBatchMock }));
vi.mock("../embedding/embedder.js", () => ({
  initEmbedder: initEmbedderMock,
  embedText: embedTextMock,
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
        return Promise.resolve({ data: null, error: null });
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
    embedTextMock.mockImplementation(async () => Array(768).fill(0.01));
  });

  it("runs chunk → embed → insert chunks → extract → embed entries → insert → done", async () => {
    const { sb, updates, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
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

    await processDocument("doc-1");

    // Status transitions: chunking → extracting → done
    const statuses = updates
      .filter((u) => u.table === "documents")
      .map((u) => u.patch.status);
    expect(statuses).toEqual(["chunking", "extracting", "done"]);

    // Chunk insert: 2 rows.
    const chunkInsert = inserts.find((i) => i.table === "chunks")!;
    expect(chunkInsert.rows).toHaveLength(2);
    expect(chunkInsert.rows[0]!.heading_path).toBe("H1 > A");

    // Entry insert: 2 rows with correct shape.
    const entryInsert = inserts.find((i) => i.table === "entries")!;
    expect(entryInsert.rows).toHaveLength(2);
    const row0 = entryInsert.rows[0]! as Record<string, unknown>;
    expect(row0.subject_id).toBe("subj-1");
    expect(row0.source_chunk_id).toBe("c-uuid-1");
    expect(row0.type).toBe("concept");
    expect(row0.importance).toBe(4);
    expect(row0.page_ref).toBe(1);

    // Extract was called once with 2 chunks (under the 5-batch threshold).
    expect(extractBatchMock).toHaveBeenCalledTimes(1);
    expect(extractBatchMock.mock.calls[0]![0]).toHaveLength(2);
  });

  it("sets status failed and rethrows on error", async () => {
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
});

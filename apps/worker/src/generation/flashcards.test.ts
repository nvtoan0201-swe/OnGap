import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("../supabase/admin.js", () => ({ admin: adminMock }));

import { deriveFlashcards } from "./flashcards.js";

interface InsertCall {
  table: string;
  rows: Array<Record<string, unknown>>;
}

function makeFakeSb(existingEntryIds: string[] = []) {
  const inserts: InsertCall[] = [];
  const from = (table: string) => {
    if (table === "flashcards") {
      return {
        select: (_cols: string) => ({
          in: (_col: string, _ids: string[]) =>
            Promise.resolve({
              data: existingEntryIds.map((id) => ({ entry_id: id })),
              error: null,
            }),
        }),
        insert: (rows: Array<Record<string, unknown>>) => {
          inserts.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  };
  return { sb: { from }, inserts };
}

describe("deriveFlashcards", () => {
  beforeEach(() => {
    adminMock.mockReset();
  });

  it("inserts 1 flashcard per concept, skips example/formula", async () => {
    const { sb, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    const inserted = await deriveFlashcards({
      documentId: "doc-1",
      subjectId: "subj-1",
      entries: [
        {
          id: "e1",
          type: "concept",
          payload_json: {
            name: "Cầu",
            definition_verbatim: "Cầu là lượng hàng người tiêu dùng muốn mua.",
            importance: 4,
            page: 1,
          },
          page_ref: 1,
        },
        {
          id: "e2",
          type: "example",
          payload_json: { description: "Ví dụ A" },
          page_ref: 2,
        },
        {
          id: "e3",
          type: "concept",
          payload_json: {
            name: "Cung",
            definition_verbatim: "Cung là lượng hàng người sản xuất muốn bán.",
            importance: 5,
          },
          page_ref: null,
        },
      ],
    });

    expect(inserted).toBe(2);
    const rows = inserts[0]!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      subject_id: "subj-1",
      entry_id: "e1",
      front: "Cầu",
      back_verbatim: "Cầu là lượng hàng người tiêu dùng muốn mua.",
      back_paraphrase: null,
      page_ref: 1,
      difficulty: 4,
    });
    expect(rows[1]!.entry_id).toBe("e3");
    expect(rows[1]!.difficulty).toBe(5);
  });

  it("skips concepts that already have a flashcard", async () => {
    const { sb, inserts } = makeFakeSb(["e1"]);
    adminMock.mockReturnValue(sb);
    const inserted = await deriveFlashcards({
      documentId: "doc-1",
      subjectId: "subj-1",
      entries: [
        {
          id: "e1",
          type: "concept",
          payload_json: { name: "X", definition_verbatim: "Y", importance: 3 },
          page_ref: null,
        },
      ],
    });
    expect(inserted).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("returns 0 when no concept entries", async () => {
    const { sb, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    const inserted = await deriveFlashcards({
      documentId: "doc-1",
      subjectId: "subj-1",
      entries: [
        {
          id: "e1",
          type: "formula",
          payload_json: { expression: "a=b" },
          page_ref: 1,
        },
      ],
    });
    expect(inserted).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("clamps difficulty into 1..5", async () => {
    const { sb, inserts } = makeFakeSb();
    adminMock.mockReturnValue(sb);
    await deriveFlashcards({
      documentId: "doc-1",
      subjectId: "subj-1",
      entries: [
        {
          id: "e1",
          type: "concept",
          payload_json: {
            name: "X",
            definition_verbatim: "Y",
            importance: 99,
          },
          page_ref: null,
        },
        {
          id: "e2",
          type: "concept",
          payload_json: {
            name: "X2",
            definition_verbatim: "Y2",
            importance: 0,
          },
          page_ref: null,
        },
      ],
    });
    const rows = inserts[0]!.rows;
    expect(rows[0]!.difficulty).toBe(5);
    expect(rows[1]!.difficulty).toBe(1);
  });
});

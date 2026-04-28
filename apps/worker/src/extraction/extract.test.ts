import { describe, it, expect, vi } from "vitest";

const { askClaudeMock } = vi.hoisted(() => ({
  askClaudeMock: vi.fn<(arg: unknown) => Promise<string>>(),
}));

vi.mock("../claude/client.js", () => ({
  askClaude: askClaudeMock,
}));

import { extractBatch } from "./extract.js";

describe("extractBatch", () => {
  it("parses a well-formed JSON array and groups entries per chunk", async () => {
    askClaudeMock.mockReset();
    askClaudeMock.mockResolvedValueOnce(
      JSON.stringify([
        {
          chunk_id: "c1",
          entries: [
            {
              type: "concept",
              name: "Cầu",
              definition_verbatim: "Cầu là lượng hàng người tiêu dùng muốn mua.",
              importance: 4,
              related: ["Cung"],
              page: 1,
            },
          ],
        },
        {
          chunk_id: "c2",
          entries: [
            {
              type: "formula",
              expression: "Q_d = a - bP",
              variables: "Q_d cầu, P giá",
              conditions: "",
              page: 2,
            },
          ],
        },
      ]),
    );

    const out = await extractBatch([
      { id: "c1", headingPath: "Chương 1 > 1.1", contentMd: "..." },
      { id: "c2", headingPath: "Chương 1 > 1.2", contentMd: "..." },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.chunk_id).toBe("c1");
    expect(out[0]!.entries[0]!.type).toBe("concept");
    expect(out[1]!.entries[0]!.type).toBe("formula");
  });

  it("tolerates JSON wrapped in markdown prose", async () => {
    askClaudeMock.mockReset();
    askClaudeMock.mockResolvedValueOnce(
      "Đây là kết quả:\n```json\n[{\"chunk_id\":\"c1\",\"entries\":[]}]\n```",
    );
    const out = await extractBatch([
      { id: "c1", headingPath: "x", contentMd: "y" },
    ]);
    expect(out).toEqual([{ chunk_id: "c1", entries: [] }]);
  });

  it("splits the batch in half on parse failure and merges both halves", async () => {
    askClaudeMock.mockReset();
    askClaudeMock
      .mockResolvedValueOnce("not json at all")
      .mockResolvedValueOnce('[{"chunk_id":"c1","entries":[]}]')
      .mockResolvedValueOnce('[{"chunk_id":"c2","entries":[]}]');

    const out = await extractBatch([
      { id: "c1", headingPath: "x", contentMd: "y" },
      { id: "c2", headingPath: "x", contentMd: "y" },
    ]);
    expect(out.map((x) => x.chunk_id).sort()).toEqual(["c1", "c2"]);
    expect(askClaudeMock).toHaveBeenCalledTimes(3);
  });

  it("returns empty entries for a single chunk that keeps failing", async () => {
    askClaudeMock.mockReset();
    askClaudeMock.mockResolvedValue("still not json");
    const out = await extractBatch([
      { id: "c1", headingPath: "x", contentMd: "y" },
    ]);
    expect(out).toEqual([{ chunk_id: "c1", entries: [] }]);
  });
});

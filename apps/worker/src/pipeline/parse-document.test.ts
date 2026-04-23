import { describe, it, expect, vi, beforeEach } from "vitest";

const updateCalls: Array<Record<string, unknown>> = [];
const updateEq = vi.fn(async () => ({ error: null }));
const updateMock = vi.fn((patch: Record<string, unknown>) => {
  updateCalls.push(patch);
  return { eq: updateEq };
});
const downloadMock = vi.fn(async () => ({
  data: new Blob([Buffer.from("fakebytes")]),
  error: null,
}));
const singleMock = vi.fn(async () => ({
  data: { id: "doc1", subject_id: "s1", file_url: "u1/s1/doc1/x.pdf", type: "slide" },
  error: null,
}));
const selectEq = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({ eq: selectEq }));
const fromMock = vi.fn(() => ({
  select: selectMock,
  update: updateMock,
}));

vi.mock("../supabase/admin.js", () => ({
  admin: () => ({
    from: fromMock,
    storage: { from: () => ({ download: downloadMock }) },
  }),
}));

vi.mock("../parsers/index.js", () => ({
  parseByMime: vi.fn(async () => ({
    markdown: "<!-- page: 1 -->\n\n# Chuong 1\n\nHello",
    pageCount: 1,
    usedOcr: false,
  })),
}));

import { parseDocument } from "./parse-document.js";

describe("parseDocument", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    updateEq.mockClear();
    downloadMock.mockClear();
    singleMock.mockClear();
  });

  it("downloads, parses, writes parsed_markdown and sets status=parsed", async () => {
    await parseDocument("doc1");
    expect(downloadMock).toHaveBeenCalledTimes(1);
    // Two updates: status=parsing then status=parsed
    const statuses = updateCalls.map((p) => p.status);
    expect(statuses).toEqual(["parsing", "parsed"]);
    expect(updateCalls[1]!.parsed_markdown).toContain("Chuong 1");
    expect(updateCalls[1]!.page_count).toBe(1);
  });
});

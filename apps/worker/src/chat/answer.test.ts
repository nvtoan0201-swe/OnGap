import { describe, it, expect, vi, beforeEach } from "vitest";

const { askClaudeMock, adminMock, embedQueryMock, initEmbedderMock } = vi.hoisted(() => ({
  askClaudeMock: vi.fn<(arg: unknown) => Promise<string>>(),
  adminMock: vi.fn(),
  embedQueryMock: vi.fn<(text: string) => Promise<number[]>>(),
  initEmbedderMock: vi.fn(async () => {}),
}));

vi.mock("../claude/client.js", () => ({ askClaude: askClaudeMock }));
vi.mock("../supabase/admin.js", () => ({ admin: adminMock }));
vi.mock("../embedding/embedder.js", () => ({
  initEmbedder: initEmbedderMock,
  embedQuery: embedQueryMock,
}));

import { answerQuery } from "./answer.js";

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function makeFakeSb(rpcResult: { data: unknown; error: { message: string } | null }) {
  const calls: RpcCall[] = [];
  const sb = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  };
  return { sb, calls };
}

describe("answerQuery", () => {
  beforeEach(() => {
    askClaudeMock.mockReset();
    adminMock.mockReset();
    embedQueryMock.mockReset();
    initEmbedderMock.mockClear();
  });

  it("returns NOT_FOUND when query is blank", async () => {
    const out = await answerQuery({ subjectId: "subj-1", query: "  " });
    expect(out.answer).toBe("Không tìm thấy trong tài liệu.");
    expect(out.citations).toEqual([]);
    expect(adminMock).not.toHaveBeenCalled();
    expect(embedQueryMock).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when RPC returns 0 hits", async () => {
    const { sb } = makeFakeSb({ data: [], error: null });
    adminMock.mockReturnValue(sb);
    embedQueryMock.mockResolvedValue([0.1, 0.2, 0.3]);

    const out = await answerQuery({ subjectId: "subj-1", query: "đệ quy là gì?" });
    expect(out.answer).toBe("Không tìm thấy trong tài liệu.");
    expect(out.citations).toEqual([]);
    expect(askClaudeMock).not.toHaveBeenCalled();
  });

  it("calls match_subject_entries with the embedding + subject + count", async () => {
    const { sb, calls } = makeFakeSb({ data: [], error: null });
    adminMock.mockReturnValue(sb);
    embedQueryMock.mockResolvedValue([0.5, 0.5, 0.5]);

    await answerQuery({ subjectId: "subj-1", query: "x" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("match_subject_entries");
    expect(calls[0]!.args.p_subject_id).toBe("subj-1");
    expect(calls[0]!.args.p_match_count).toBe(8);
    expect(calls[0]!.args.p_query_embedding).toBe("[0.5,0.5,0.5]");
  });

  it("on hits → builds prompt, calls Claude, returns answer + citations", async () => {
    const hit = {
      id: "e1",
      type: "concept" as const,
      payload_json: { name: "Đệ quy", definition_verbatim: "Là kỹ thuật ..." },
      page_ref: 12,
      heading_path: "Chương 2 > Đệ quy",
      similarity: 0.9,
    };
    const { sb } = makeFakeSb({ data: [hit], error: null });
    adminMock.mockReturnValue(sb);
    embedQueryMock.mockResolvedValue([0, 0, 0]);
    askClaudeMock.mockResolvedValueOnce("Đệ quy là ... [trang 12 — Chương 2 > Đệ quy]");

    const out = await answerQuery({ subjectId: "subj-1", query: "đệ quy là gì?" });
    expect(askClaudeMock).toHaveBeenCalledTimes(1);
    const call = askClaudeMock.mock.calls[0]![0] as { prompt: string; model: string };
    expect(call.model).toBe("haiku");
    expect(call.prompt).toContain("Câu hỏi: đệ quy là gì?");
    expect(call.prompt).toContain("Đệ quy: Là kỹ thuật ...");
    expect(out.answer).toContain("[trang 12 — Chương 2 > Đệ quy]");
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0]!.page).toBe(12);
  });

  it("RPC error → throws", async () => {
    const { sb } = makeFakeSb({ data: null, error: { message: "boom" } });
    adminMock.mockReturnValue(sb);
    embedQueryMock.mockResolvedValue([0]);

    await expect(answerQuery({ subjectId: "subj-1", query: "x" })).rejects.toThrow(/boom/);
  });
});

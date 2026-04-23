import { describe, it, expect, vi } from "vitest";

const { rpcMock, parseDocumentMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  parseDocumentMock: vi.fn(async () => {}),
}));

vi.mock("../supabase/admin.js", () => ({
  admin: () => ({
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  }),
}));

vi.mock("../pipeline/parse-document.js", () => ({
  parseDocument: parseDocumentMock,
}));

import { runOnce } from "./poller.js";

describe("poller.runOnce", () => {
  it("returns false when no jobs are queued", async () => {
    rpcMock.mockReset();
    parseDocumentMock.mockReset();
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const handled = await runOnce("test-worker");
    expect(handled).toBe(false);
    expect(parseDocumentMock).not.toHaveBeenCalled();
  });

  it("runs parseDocument on a parse job and marks success", async () => {
    rpcMock.mockReset();
    parseDocumentMock.mockReset();
    rpcMock
      .mockResolvedValueOnce({
        data: [{ job_id: "j1", document_id: "d1", kind: "parse" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const handled = await runOnce("test-worker");
    expect(handled).toBe(true);
    expect(parseDocumentMock).toHaveBeenCalledWith("d1");
    expect(rpcMock).toHaveBeenNthCalledWith(2, "complete_document_job", {
      p_job_id: "j1",
      p_success: true,
      p_error: null,
    });
  });

  it("marks failure when parseDocument throws", async () => {
    rpcMock.mockReset();
    parseDocumentMock.mockReset();
    rpcMock
      .mockResolvedValueOnce({
        data: [{ job_id: "j2", document_id: "d2", kind: "parse" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    parseDocumentMock.mockRejectedValueOnce(new Error("boom"));
    const handled = await runOnce("test-worker");
    expect(handled).toBe(true);
    expect(rpcMock).toHaveBeenNthCalledWith(2, "complete_document_job", {
      p_job_id: "j2",
      p_success: false,
      p_error: "boom",
    });
  });
});

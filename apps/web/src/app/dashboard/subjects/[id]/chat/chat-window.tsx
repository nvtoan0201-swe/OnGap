"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askChat, type ChatResult } from "./chat-actions";

interface Turn {
  role: "user" | "assistant";
  content: string;
  citations?: ChatResult["citations"];
}

const TYPE_LABEL: Record<"concept" | "example" | "formula", string> = {
  concept: "khái niệm",
  example: "ví dụ",
  formula: "công thức",
};

export function ChatWindow({ subjectId }: { subjectId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    if (!q || isPending) return;
    setError(null);
    setTurns((t) => [...t, { role: "user", content: q }]);
    setDraft("");
    startTransition(async () => {
      try {
        const result = await askChat(subjectId, q);
        setTurns((t) => [
          ...t,
          { role: "assistant", content: result.answer, citations: result.citations },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3 min-h-[200px]">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Hỏi bất cứ điều gì về môn này — câu trả lời được trích thẳng từ slide với trang + đề mục.
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === "user"
                ? "rounded-md bg-primary/10 p-3 text-sm"
                : "rounded-md border p-3 text-sm space-y-2"
            }
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t.role === "user" ? "Bạn" : "ÔnGấp"}
            </div>
            <div className="whitespace-pre-wrap">{t.content}</div>
            {t.citations && t.citations.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Trích dẫn ({t.citations.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {t.citations.map((c, j) => (
                    <li key={j}>
                      <span className="font-medium">
                        [{TYPE_LABEL[c.type]}, {c.page != null ? `trang ${c.page}` : "không rõ trang"} — {c.heading_path}]
                      </span>{" "}
                      {c.snippet}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {isPending && (
          <p className="text-sm text-muted-foreground italic">Đang tìm trong tài liệu…</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nhập câu hỏi…"
          disabled={isPending}
          maxLength={2000}
        />
        <Button type="submit" disabled={isPending || !draft.trim()}>
          Hỏi
        </Button>
      </form>
    </div>
  );
}

"use server";

import { createClient } from "@/lib/supabase/server";

const WORKER_CHAT_URL = process.env.WORKER_CHAT_URL ?? "http://127.0.0.1:4000/chat";

export interface Citation {
  page: number | null;
  heading_path: string;
  type: "concept" | "example" | "formula";
  snippet: string;
}

export interface ChatResult {
  answer: string;
  citations: Citation[];
}

/**
 * Server action: verify the caller owns the subject (via RLS), then forward
 * the question to the worker's HTTP endpoint. Returns answer + citations.
 */
export async function askChat(subjectId: string, query: string): Promise<ChatResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { answer: "Vui lòng nhập câu hỏi.", citations: [] };
  }
  if (trimmed.length > 2000) {
    throw new Error("Câu hỏi quá dài (> 2000 ký tự).");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập.");

  const { data: subject, error } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .single();
  if (error || !subject) {
    throw new Error("Không tìm thấy môn hoặc không phải của bạn.");
  }

  const res = await fetch(WORKER_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectId, query: trimmed }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Worker lỗi (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as ChatResult;
  return json;
}

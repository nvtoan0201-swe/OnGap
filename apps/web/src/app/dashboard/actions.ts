"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createSubject(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const examDateRaw = String(formData.get("exam_date") ?? "").trim();
  const exam_date = examDateRaw ? examDateRaw : null;

  if (!name) {
    throw new Error("Tên môn là bắt buộc");
  }

  const { error } = await supabase.from("subjects").insert({
    user_id: user.id,
    name,
    code,
    exam_date,
  });

  if (error) throw error;
  redirect("/dashboard");
}

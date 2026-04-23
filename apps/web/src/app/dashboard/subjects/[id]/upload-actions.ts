"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function extFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  throw new Error("unsupported mime");
}

export async function uploadDocument(subjectId: string, formData: FormData) {
  const file = formData.get("file");
  const type = (formData.get("type") as string) ?? "slide";
  if (!(file instanceof File)) throw new Error("No file");
  if (!ALLOWED.has(file.type)) throw new Error(`Không hỗ trợ định dạng: ${file.type}`);
  if (file.size > 50 * 1024 * 1024) throw new Error("File > 50 MB");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subj, error: subjErr } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .single();
  if (subjErr || !subj) throw new Error("Không tìm thấy môn hoặc không phải của bạn");

  const documentId = randomUUID();
  const ext = extFromMime(file.type);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${subjectId}/${documentId}/${safeName || `file.${ext}`}`;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`Upload thất bại: ${upErr.message}`);

  const { error: docErr } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      subject_id: subjectId,
      type,
      file_url: path,
      status: "pending",
    });
  if (docErr) {
    await supabase.storage.from("documents").remove([path]);
    throw new Error(`DB insert failed: ${docErr.message}`);
  }

  const { error: jobErr } = await supabase.rpc("enqueue_parse_job", {
    p_document_id: documentId,
  });
  if (jobErr) throw new Error(`Enqueue failed: ${jobErr.message}`);

  revalidatePath(`/dashboard/subjects/${subjectId}`);
}

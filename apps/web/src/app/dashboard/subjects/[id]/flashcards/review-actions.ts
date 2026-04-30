"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nextReviewAt, type Rating } from "@/lib/study/sm2";

const ALLOWED: Rating[] = [1, 3, 5];

export async function submitReview(
  subjectId: string,
  flashcardId: string,
  rating: number,
) {
  if (!ALLOWED.includes(rating as Rating)) {
    throw new Error(`Rating không hợp lệ: ${rating}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("flashcard_reviews").insert({
    flashcard_id: flashcardId,
    user_id: user.id,
    rating,
    next_review_at: nextReviewAt(rating as Rating).toISOString(),
  });
  if (error) throw new Error(`Lưu review thất bại: ${error.message}`);

  revalidatePath(`/dashboard/subjects/${subjectId}/flashcards`);
}

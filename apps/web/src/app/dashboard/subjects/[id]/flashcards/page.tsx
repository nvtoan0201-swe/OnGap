import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { StudySession, type StudyCard } from "./study-session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FlashcardsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!subject) redirect("/dashboard");

  const { data: rawCards } = await supabase
    .from("flashcards")
    .select("id, front, back_verbatim, page_ref, difficulty")
    .eq("subject_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const cards: StudyCard[] = (rawCards ?? []).map((c) => ({
    id: c.id,
    front: c.front,
    back_verbatim: c.back_verbatim,
    page_ref: c.page_ref,
    difficulty: c.difficulty,
  }));

  // Reviews today (UTC midnight is acceptable for v1).
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const flashcardIds = cards.map((c) => c.id);
  let reviewedToday = 0;
  if (flashcardIds.length > 0) {
    const { count } = await supabase
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfDay.toISOString())
      .in("flashcard_id", flashcardIds);
    reviewedToday = count ?? 0;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-xl space-y-6">
        <div>
          <Link
            href={`/dashboard/subjects/${id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {subject.name}
          </Link>
          <h1 className="text-2xl font-bold mt-2">Học flashcard</h1>
          <p className="text-sm text-muted-foreground">
            {cards.length} thẻ · {reviewedToday} đã ôn hôm nay
          </p>
        </div>

        <StudySession subjectId={id} cards={cards} />
      </main>
    </div>
  );
}

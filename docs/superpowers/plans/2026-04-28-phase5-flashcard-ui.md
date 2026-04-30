# ÔnGấp — Phase 5 (Flashcard Study UI + minimal SM-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the user a working flashcard study screen at `/dashboard/subjects/[id]/flashcards` — front shown, tap to flip → back (verbatim) + page citation, then "Thuộc / Chưa thuộc / Khó" buttons. Each rating writes one `flashcard_reviews` row with a `next_review_at` set by a small SM-2-style schedule. The subject detail page gains a "X flashcards · Y reviewed today" stat with a link, and a coverage badge from the latest `coverage_audits` row.

**Architecture:** Three new files under `apps/web/src/app/dashboard/subjects/[id]/flashcards/` (`page.tsx` SSR + `study-session.tsx` client + `review-actions.ts` server action), one shared pure module `apps/web/src/lib/study/sm2.ts`, and one modified file (`app/dashboard/subjects/[id]/page.tsx`). RLS already covers `flashcards` (by subject owner) and `flashcard_reviews` (own) — no migrations. The schedule function is server-side only (used inside the server action) so the client never recomputes it.

**Tech Stack:** Next.js 16 (App Router; `params` is a `Promise`), React 19, Supabase SSR client (`@/lib/supabase/server`), shadcn/ui (Card/Button/Label), Tailwind 4. No new dependencies.

**Prerequisite:** Phase 4 commit on `main` (audit + flashcards merged). Worker has populated `public.flashcards` for any document that finished `process-document`. RLS policies from migration `20260423000005_rls_policies.sql` are already enforced.

**Out of scope (Phase 6+):** chat RAG, quiz adaptive UI, exam prediction, gap retry, paraphrase generation, PWA shell, streak gamification, swipe gesture (we use tap-only buttons in Phase 5; gesture polish is Phase 6+), unit-test infra for `apps/web` (worker vitest stays where it is; SM-2 is verified by inspection + manual flow). MoMo/ZaloPay, onboarding, university/major selection.

---

## File Structure (locked)

```
apps/web/src/
  app/dashboard/subjects/[id]/flashcards/
    page.tsx               # NEW  — SSR: load flashcards + today review count
    study-session.tsx      # NEW  — "use client": stack/flip/rate UI, calls server action
    review-actions.ts      # NEW  — "use server": submit rating, write flashcard_reviews row
  app/dashboard/subjects/[id]/
    page.tsx               # MODIFY — add flashcard stats card + coverage badge
  lib/study/
    sm2.ts                 # NEW  — pure: nextReviewAt(rating, now) → Date
docs/superpowers/plans/
  2026-04-28-phase5-flashcard-ui.md   # THIS file
README.md                  # MODIFY — Phase 5 status section
```

No DB migrations. No new npm deps. Vietnamese-first copy throughout.

---

## Task 1 — SM-2 light scheduler (pure server-side fn)

**Files:**
- Create: `apps/web/src/lib/study/sm2.ts`

Schedule (from `project-phase5-recommendation.md`):

| rating | meaning            | next_review_at delta |
|--------|--------------------|----------------------|
| 0      | Sai hoàn toàn      | now + 5 min          |
| 1      | Khó, gần như sai   | now + 5 min          |
| 2      | Khó, vừa nhớ ra    | now + 10 min         |
| 3      | Đúng nhưng do dự   | now + 1 day          |
| 4      | Đúng, hơi do dự    | now + 3 day          |
| 5      | Đúng, dễ           | now + 7 day          |

The Phase 5 UI surfaces only **3 buttons** (Khó / Bình thường / Thuộc) which map to ratings **1 / 3 / 5** respectively. Ratings 0/2/4 stay in the schedule table for future tuning but are not exposed yet.

- [ ] **Step 1: Create the scheduler module**

```ts
// apps/web/src/lib/study/sm2.ts

// Minimal SM-2-flavoured schedule. Pure: same input → same output.
// Tuneable later — currently maps user-perceived difficulty to a fixed
// delay. No EF/interval state stored on the flashcard yet.
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

const MS = {
  min: 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

export function nextReviewAt(rating: Rating, now: Date = new Date()): Date {
  const t = now.getTime();
  switch (rating) {
    case 0:
    case 1:
      return new Date(t + 5 * MS.min);
    case 2:
      return new Date(t + 10 * MS.min);
    case 3:
      return new Date(t + 1 * MS.day);
    case 4:
      return new Date(t + 3 * MS.day);
    case 5:
      return new Date(t + 7 * MS.day);
  }
}
```

- [ ] **Step 2: Verify by inspection**

Open the file, mentally trace the three exposed ratings: `1 → +5min`, `3 → +1day`, `5 → +7day`. Match the schedule table above. Done.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/study/sm2.ts
git commit -m "feat(web): SM-2 light scheduler for flashcard reviews"
```

---

## Task 2 — Review server action

**Files:**
- Create: `apps/web/src/app/dashboard/subjects/[id]/flashcards/review-actions.ts`

Server action `submitReview(flashcardId, rating)`:
1. Resolve the authed user via `createClient()`.
2. Validate `rating` ∈ {1,3,5} (the three exposed buttons).
3. Compute `nextReviewAt(rating)`.
4. Insert into `flashcard_reviews` with `{flashcard_id, user_id, rating, next_review_at}`.
5. Revalidate `/dashboard/subjects/[id]/flashcards`.

RLS will reject the insert if `flashcard_id` doesn't ultimately belong to the user — no extra ownership check needed in code.

- [ ] **Step 1: Create the server action**

```ts
// apps/web/src/app/dashboard/subjects/[id]/flashcards/review-actions.ts
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
```

- [ ] **Step 2: Typecheck**

```bash
npm --workspace apps/web run typecheck
```

Expected: clean. If a TS error mentions `Rating` not assignable, double-check the `as Rating` cast on the validated `rating`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/subjects/[id]/flashcards/review-actions.ts
git commit -m "feat(web): submitReview server action with SM-2 scheduling"
```

---

## Task 3 — Study session client component

**Files:**
- Create: `apps/web/src/app/dashboard/subjects/[id]/flashcards/study-session.tsx`

Client component receives an array of `{id, front, back_verbatim, page_ref, difficulty}` and the `subjectId`. Shows one card at a time:

- Default view: front text only, "Bấm để xem mặt sau" hint at bottom.
- After tap on the card body: reveal back text + `Trang N` chip if `page_ref` set.
- After flip, three buttons appear: **Khó** (rating 1) / **Bình thường** (3) / **Thuộc** (5).
- On click: optimistically advance to the next card, fire `submitReview()` in transition.
- After last card: show "Hoàn thành Y thẻ" + link back to subject.
- Empty state (zero cards passed in): "Chưa có flashcard. Tải tài liệu và đợi xử lý xong."

State:
```ts
const [index, setIndex] = useState(0);
const [flipped, setFlipped] = useState(false);
const [isPending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);
```

Layout: a centered Card sized roughly h-[60vh] max-w-md, large font for `front`, scrollable area for `back_verbatim` (verbatim definitions can be long).

- [ ] **Step 1: Create the client component**

```tsx
// apps/web/src/app/dashboard/subjects/[id]/flashcards/study-session.tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { submitReview } from "./review-actions";

export interface StudyCard {
  id: string;
  front: string;
  back_verbatim: string;
  page_ref: number | null;
  difficulty: number;
}

interface Props {
  subjectId: string;
  cards: StudyCard[];
}

const RATINGS: { label: string; value: 1 | 3 | 5; variant: "destructive" | "secondary" | "default" }[] = [
  { label: "Khó", value: 1, variant: "destructive" },
  { label: "Bình thường", value: 3, variant: "secondary" },
  { label: "Thuộc", value: 5, variant: "default" },
];

export function StudySession({ subjectId, cards }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          Chưa có flashcard. Tải tài liệu lên và đợi xử lý xong (~1-2 phút).
        </CardContent>
      </Card>
    );
  }

  if (index >= cards.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <div className="text-lg font-semibold">Hoàn thành {cards.length} thẻ</div>
          <Link
            href={`/dashboard/subjects/${subjectId}`}
            className="text-sm underline"
          >
            ← Quay lại môn học
          </Link>
        </CardContent>
      </Card>
    );
  }

  const card = cards[index];

  function rate(rating: 1 | 3 | 5) {
    setError(null);
    const flashcardId = card.id;
    setIndex((i) => i + 1);
    setFlipped(false);
    startTransition(async () => {
      try {
        await submitReview(subjectId, flashcardId, rating);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Thẻ {index + 1} / {cards.length}
      </div>

      <Card
        className="min-h-[55vh] cursor-pointer select-none"
        onClick={() => !flipped && setFlipped(true)}
      >
        <CardContent className="p-6 flex flex-col gap-4 h-full">
          <div className="text-xl font-medium leading-relaxed">{card.front}</div>

          {flipped && (
            <>
              <div className="border-t pt-4 text-sm whitespace-pre-wrap leading-relaxed">
                {card.back_verbatim}
              </div>
              {card.page_ref != null && (
                <div className="text-xs text-muted-foreground">
                  Nguồn: trang {card.page_ref}
                </div>
              )}
            </>
          )}

          {!flipped && (
            <div className="mt-auto text-xs text-muted-foreground text-center">
              Bấm để xem mặt sau
            </div>
          )}
        </CardContent>
      </Card>

      {flipped && (
        <div className="grid grid-cols-3 gap-2">
          {RATINGS.map((r) => (
            <Button
              key={r.value}
              variant={r.variant}
              disabled={isPending}
              onClick={() => rate(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm --workspace apps/web run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/subjects/[id]/flashcards/study-session.tsx
git commit -m "feat(web): StudySession client component with flip + rate"
```

---

## Task 4 — Flashcards SSR page

**Files:**
- Create: `apps/web/src/app/dashboard/subjects/[id]/flashcards/page.tsx`

Server component. Loads:
1. The subject (verifies ownership via RLS).
2. Up to **30** flashcards for the subject ordered by `created_at desc` (Phase 5 keeps the queue simple — no due-date filtering yet; we deliberately study ALL cards each session and rely on the user pressing "Thuộc" to skip subjectively-easy ones).
3. Today's review count: `count` of `flashcard_reviews` for the user where `created_at >= today_start` AND `flashcard_id IN subject's flashcards`. (One extra cheap query.)

Renders a header (subject name + "X thẻ · Y đã ôn hôm nay") and the `<StudySession />` component.

- [ ] **Step 1: Create the SSR page**

```tsx
// apps/web/src/app/dashboard/subjects/[id]/flashcards/page.tsx
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

  // Reviews today (local-tz approximation: UTC midnight is acceptable for v1).
  const startOfDayIso = new Date();
  startOfDayIso.setUTCHours(0, 0, 0, 0);
  const flashcardIds = cards.map((c) => c.id);
  let reviewedToday = 0;
  if (flashcardIds.length > 0) {
    const { count } = await supabase
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfDayIso.toISOString())
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
```

- [ ] **Step 2: Typecheck**

```bash
npm --workspace apps/web run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/subjects/[id]/flashcards/page.tsx
git commit -m "feat(web): flashcards SSR page (30-card queue, today review count)"
```

---

## Task 5 — Subject detail: stats card + coverage badge + study link

**Files:**
- Modify: `apps/web/src/app/dashboard/subjects/[id]/page.tsx`

Add **two queries** to the existing SSR page:
1. Flashcard count: `select count from flashcards where subject_id = id`.
2. Latest coverage: `select coverage_pct from coverage_audits where subject_id = id order by created_at desc limit 1`.

Add **two UI blocks** between the existing subject header and the "Tải lên tài liệu" card:
- A "Học bài" Card with the flashcard count, a coverage badge if available, and a primary-button link to `/dashboard/subjects/[id]/flashcards`.

The existing `STATUS_LABELS` map and document list stay untouched.

- [ ] **Step 1: Read the file to confirm current shape**

Already read in the planning step — header at lines 12-22, fetches at 29-40, render at 42-110.

- [ ] **Step 2: Add fetches and Học-bài card**

Apply this Edit to `apps/web/src/app/dashboard/subjects/[id]/page.tsx`:

Replace (current structure between subject fetch and the upload card):

```tsx
  const { data: documents } = await supabase
    .from("documents")
    .select("id, type, file_url, status, page_count, created_at")
    .eq("subject_id", id)
    .order("created_at", { ascending: false });

  return (
```

with:

```tsx
  const { data: documents } = await supabase
    .from("documents")
    .select("id, type, file_url, status, page_count, created_at")
    .eq("subject_id", id)
    .order("created_at", { ascending: false });

  const { count: flashcardCount } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", id);

  const { data: latestAudit } = await supabase
    .from("coverage_audits")
    .select("coverage_pct, created_at")
    .eq("subject_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
```

Then **add** a new `<Card>` block immediately AFTER the closing `</div>` of the subject header (after line 55 `</div>`, BEFORE the "Tải lên tài liệu" Card). The new block:

```tsx
        <Card>
          <CardHeader>
            <CardTitle>Học bài</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="font-medium">{flashcardCount ?? 0} flashcard</div>
              {latestAudit?.coverage_pct != null && (
                <div className="text-xs text-muted-foreground mt-1">
                  Đã phân tích {Number(latestAudit.coverage_pct).toFixed(0)}% nội dung
                </div>
              )}
            </div>
            {(flashcardCount ?? 0) > 0 ? (
              <Link
                href={`/dashboard/subjects/${id}/flashcards`}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                Bắt đầu học
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                Đang chờ tài liệu
              </span>
            )}
          </CardContent>
        </Card>
```

(Use a plain styled `<Link>` not `buttonVariants` because the import isn't present in this file and we keep the diff small. Tailwind classes mirror the `default` button variant.)

- [ ] **Step 3: Typecheck**

```bash
npm --workspace apps/web run typecheck
```

Expected: clean. If TS complains about `coverage_pct` being `unknown`, the `Number(...)` cast already handles it; add `as number | null` if needed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/subjects/[id]/page.tsx
git commit -m "feat(web): subject detail study card + coverage badge + flashcard link"
```

---

## Task 6 — Manual verification (browser flow)

This is a UI phase — typecheck is necessary but not sufficient. CLAUDE.md requires browser verification of the golden path AND edge cases for UI work.

- [ ] **Step 1: Start the web dev server**

```bash
npm --workspace apps/web run dev
```

Run in the background. Wait for "Ready on http://localhost:3000".

- [ ] **Step 2: Start the worker (need at least one document fully processed for the flashcard list to populate)**

```bash
npm --workspace apps/worker run dev
```

Run in the background. If a document is already at `status=done` in your local DB, the worker isn't strictly required — the flashcards table is already populated.

- [ ] **Step 3: Golden path — study a card**

In a browser:
1. Login → `/dashboard` → click a subject that has a `done` document.
2. Subject page should show "Học bài" card with **non-zero flashcard count** and a **coverage %** if Phase 4 audit ran. Click **Bắt đầu học**.
3. Flashcards page: title `Học flashcard`, subtitle `N thẻ · 0 đã ôn hôm nay`, Card 1/N visible with `front` text only.
4. Click the card body → back text + `Nguồn: trang K` line appears (assuming the card has `page_ref`).
5. Click **Thuộc**. The next card appears, flipped state resets.
6. Continue until all cards done → "Hoàn thành N thẻ" screen + back link.
7. Reload the flashcards page → subtitle now shows `... · N đã ôn hôm nay`.

- [ ] **Step 4: Edge case — empty subject**

Create a fresh subject with NO documents. Open it: "Học bài" card should say `0 flashcard` + `Đang chờ tài liệu` (no button).

- [ ] **Step 5: Edge case — direct URL to flashcards page on empty subject**

Manually navigate to `/dashboard/subjects/{empty-subject-id}/flashcards`. Page should render the empty state Card from `StudySession`.

- [ ] **Step 6: Verify DB rows**

Open Supabase Studio (or `psql`):

```sql
select rating, next_review_at, created_at
from flashcard_reviews
order by created_at desc
limit 5;
```

Expected: rows with `rating in (1,3,5)`, `next_review_at` ≈ `created_at + (5min | 1d | 7d)` matching what you clicked.

- [ ] **Step 7: Stop dev servers**

Stop the two background tasks.

- [ ] **Step 8: Note verification result in commit**

If everything passed, no extra commit needed. If you found a bug, fix it now before moving to Task 7. Re-run the relevant steps.

---

## Task 7 — README + Phase 5 sign-off + push

**Files:**
- Modify: `README.md`

Add a Phase 5 status section after the Phase 4 section (mirroring the Phase 3/4 pattern).

- [ ] **Step 1: Append Phase 5 section to README**

Add a section using the same format as the existing Phase 3/4 sections (commit hash filled in after the next commit; for now leave a placeholder you'll edit in step 3):

```md
### Phase 5 — Flashcard study UI + minimal SM-2 (commit `<HASH>`)

- New `/dashboard/subjects/[id]/flashcards` page: 30-card queue, tap-to-flip, three-button rating (Khó / Bình thường / Thuộc).
- `flashcard_reviews` rows persisted with SM-2-light schedule (5 min / 1 day / 7 day).
- Subject detail page surfaces flashcard count + coverage % + entry link.

**Sign-off checklist:**
- [ ] Login → subject with `done` document → "Học bài" card shows count + coverage %.
- [ ] Bắt đầu học → flip a card → all 3 ratings produce a `flashcard_reviews` row with the correct `next_review_at` delta.
- [ ] Reload flashcards page → "đã ôn hôm nay" counter increments.
- [ ] Empty subject → "Đang chờ tài liệu" + flashcards page shows empty Card.
- [ ] Typecheck clean (`npm --workspace apps/web run typecheck`).
```

- [ ] **Step 2: Commit README placeholder + capture HEAD**

```bash
git add README.md
git commit -m "docs: phase 5 status + sign-off checklist"
git rev-parse --short HEAD
```

Capture the short SHA from the output.

- [ ] **Step 3: Backfill the commit hash in the README**

Edit the `commit \`<HASH>\`` placeholder you wrote in step 1 with the SHA from step 2. Then:

```bash
git add README.md
git commit --amend --no-edit
```

(Amending the just-made commit is fine — it's local and unpushed.)

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: fast-forward of the 5–6 new commits onto `origin/main`.

- [ ] **Step 5: Update memory**

Edit `C:\Users\Toan\.claude\projects\D--saurieng\memory\project-phase-status.md` to move Phase 5 from "NOT built" to "Done", and `project-phase5-recommendation.md` to mark the flashcard UI item as completed (or replace its content with a Phase 6 = Chat RAG recommendation).

---

## Self-review checklist

- [x] Spec coverage: every bullet in `project-phase5-recommendation.md` (flashcards page, swipe/tap, persist with SM-2, subject stat, coverage badge, no paraphrase) → mapped to Tasks 1-5.
- [x] No placeholders: every code block is complete and runnable. README "<HASH>" is a literal placeholder backfilled in Task 7 step 3.
- [x] Type consistency: `Rating` is the same union (`0|1|2|3|4|5`) in `sm2.ts` and the `as Rating` cast in `review-actions.ts`. `StudyCard` is exported from `study-session.tsx` and imported by `page.tsx`. `subjectId`, `flashcardId`, `rating` arg order is consistent across `submitReview` declaration and call site.
- [x] No new deps. No migrations. Vietnamese copy throughout. Page markers honored via `page_ref` column.

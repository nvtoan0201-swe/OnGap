-- Every user-owned table enables RLS. Worker uses service_role which bypasses RLS.

alter table public.users             enable row level security;
alter table public.subjects          enable row level security;
alter table public.documents         enable row level security;
alter table public.chunks            enable row level security;
alter table public.entries           enable row level security;
alter table public.coverage_audits   enable row level security;
alter table public.summaries         enable row level security;
alter table public.flashcards        enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.quizzes           enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.exam_predictions  enable row level security;
alter table public.past_exams        enable row level security;
alter table public.gap_reports       enable row level security;
alter table public.subscriptions     enable row level security;

-- users: each user sees/edits only their own row.
create policy "users: select own" on public.users
  for select using (auth.uid() = id);
create policy "users: update own" on public.users
  for update using (auth.uid() = id);

-- subjects: owned by user.
create policy "subjects: owner all" on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- documents / chunks / entries / audits / summaries: scoped via subject owner.
create policy "documents: by subject owner" on public.documents
  for all using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

create policy "chunks: by document owner" on public.chunks
  for select using (
    exists (
      select 1 from public.documents d
      join public.subjects s on s.id = d.subject_id
      where d.id = document_id and s.user_id = auth.uid()
    )
  );

create policy "entries: by subject owner" on public.entries
  for select using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

create policy "coverage_audits: by subject owner" on public.coverage_audits
  for select using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

create policy "summaries: by subject owner" on public.summaries
  for select using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

-- study tables: owner via subject.
create policy "flashcards: by subject owner" on public.flashcards
  for all using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

create policy "flashcard_reviews: own" on public.flashcard_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quizzes: by subject owner" on public.quizzes
  for all using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

create policy "quiz_attempts: own" on public.quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "exam_predictions: by subject owner" on public.exam_predictions
  for select using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

-- past_exams: publicly readable (crowdsource), insertable by authenticated users.
create policy "past_exams: public read" on public.past_exams
  for select using (true);
create policy "past_exams: insert authenticated" on public.past_exams
  for insert with check (auth.uid() = uploaded_by_user_id);

create policy "gap_reports: own" on public.gap_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subscriptions: own" on public.subscriptions
  for select using (auth.uid() = user_id);

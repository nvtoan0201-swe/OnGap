-- Flashcards generated from entries. back_verbatim is preferred, back_paraphrase is backup.
create table public.flashcards (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  front text not null,
  back_verbatim text not null,
  back_paraphrase text,
  page_ref integer,
  difficulty integer not null default 3 check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

create index idx_flashcards_subject on public.flashcards(subject_id);

create table public.flashcard_reviews (
  id uuid primary key default uuid_generate_v4(),
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null check (rating between 0 and 5),
  next_review_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_flashcard_reviews_user on public.flashcard_reviews(user_id);

-- Quizzes (multiple choice or short answer) bound to a source entry.
create table public.quizzes (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  question text not null,
  options_json jsonb,
  correct_answer text not null,
  explanation text,
  type text not null check (type in ('mcq', 'short_answer')),
  created_at timestamptz not null default now()
);

create index idx_quizzes_subject on public.quizzes(subject_id);

create table public.quiz_attempts (
  id uuid primary key default uuid_generate_v4(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  answer text not null,
  correct boolean not null,
  attempted_at timestamptz not null default now()
);

create index idx_quiz_attempts_user on public.quiz_attempts(user_id);

-- Exam question predictions. source_entries + source_past_exams are UUID arrays.
create table public.exam_predictions (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  question_sample text not null,
  confidence numeric(5,2) not null check (confidence between 0 and 1),
  source_entries uuid[] not null default '{}',
  source_past_exams uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Crowdsourced past exams (unverified by default).
create table public.past_exams (
  id uuid primary key default uuid_generate_v4(),
  subject_code text,
  university text,
  year integer,
  content text not null,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  verified boolean not null default false,
  verified_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_past_exams_code_uni on public.past_exams(subject_code, university);

-- "Báo thiếu" user-reported gap (re-process request).
create table public.gap_reports (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

-- Subscriptions (MoMo/ZaloPay refs land here in Phase 1).
create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'monthly', 'semester', 'annual')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  momo_ref text,
  started_at timestamptz not null default now(),
  expires_at timestamptz
);

create index idx_subscriptions_user on public.subscriptions(user_id);

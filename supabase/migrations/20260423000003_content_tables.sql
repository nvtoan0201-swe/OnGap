-- Uploaded document (slide, đề cương, đề thi cũ).
create table public.documents (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  type text not null check (type in ('slide', 'outline', 'past_exam')),
  file_url text not null,
  parsed_markdown text,
  page_count integer,
  status text not null default 'pending'
    check (status in ('pending', 'parsing', 'chunking', 'extracting', 'auditing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_documents_subject on public.documents(subject_id);
create index idx_documents_status on public.documents(status);

-- Heading-aware chunks of parsed markdown.
create table public.chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  heading_path text not null,
  page_from integer,
  page_to integer,
  content_md text not null,
  token_count integer,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index idx_chunks_document on public.chunks(document_id);
create index idx_chunks_embedding on public.chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Extracted knowledge entries (Concept / Example / Formula). One chunk -> 5-20 entries.
create table public.entries (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  source_chunk_id uuid not null references public.chunks(id) on delete cascade,
  type text not null check (type in ('concept', 'example', 'formula')),
  payload_json jsonb not null,
  importance integer not null default 3 check (importance between 1 and 5),
  page_ref integer,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index idx_entries_subject on public.entries(subject_id);
create index idx_entries_chunk on public.entries(source_chunk_id);
create index idx_entries_embedding on public.entries
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Coverage audit result (one per document after extraction).
create table public.coverage_audits (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  outline_json jsonb not null,
  gaps_json jsonb not null default '[]'::jsonb,
  coverage_pct numeric(5,2) not null,
  audited_at timestamptz not null default now()
);

-- Navigation layer summary (heading + 3-line blurbs). Not a study doc.
create table public.summaries (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  outline_md text not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

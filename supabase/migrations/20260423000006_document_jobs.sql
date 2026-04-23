-- Work queue for the Node worker. One row per document that needs processing.
-- The worker claims via claim_next_document_job() which uses SKIP LOCKED.
create table public.document_jobs (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  kind text not null default 'parse'
    check (kind in ('parse', 'chunk', 'extract', 'audit')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  claimed_by text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_document_jobs_status on public.document_jobs(status, created_at);
create index idx_document_jobs_document on public.document_jobs(document_id);

alter table public.document_jobs enable row level security;
-- No end-user policies: jobs are server-side only. Worker uses service_role
-- which bypasses RLS; end users cannot read or write this table directly.

-- Atomic claim for a worker. Uses SKIP LOCKED so multiple workers never
-- race for the same job. Returns 0 or 1 row.
create or replace function public.claim_next_document_job(worker_id text)
returns table (
  job_id uuid,
  document_id uuid,
  kind text
)
language plpgsql
security definer
as $$
declare
  picked uuid;
begin
  select id into picked
  from public.document_jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if picked is null then
    return;
  end if;

  update public.document_jobs
    set status = 'running',
        attempts = attempts + 1,
        claimed_by = worker_id,
        claimed_at = now(),
        updated_at = now()
    where id = picked;

  return query
    select j.id, j.document_id, j.kind
    from public.document_jobs j
    where j.id = picked;
end;
$$;

grant execute on function public.claim_next_document_job(text) to service_role;

create or replace function public.complete_document_job(
  p_job_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update public.document_jobs
    set status = case when p_success then 'done' else 'failed' end,
        last_error = p_error,
        updated_at = now()
    where id = p_job_id;
end;
$$;

grant execute on function public.complete_document_job(uuid, boolean, text) to service_role;

-- Extend documents.status to include a 'parsed' terminal state for Phase 2.
alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status in ('pending', 'parsing', 'parsed', 'chunking', 'extracting', 'auditing', 'done', 'failed'));

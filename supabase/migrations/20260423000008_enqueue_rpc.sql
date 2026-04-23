-- SECURITY DEFINER function callable by the web app (authenticated JWT) to
-- enqueue a parse job for a document the caller owns. Without this, the web
-- app would need service_role which must never reach the browser.
create or replace function public.enqueue_parse_job(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_job_id uuid;
  owner uuid;
begin
  select s.user_id into owner
  from public.documents d
  join public.subjects s on s.id = d.subject_id
  where d.id = p_document_id;

  if owner is null then
    raise exception 'Document % not found', p_document_id using errcode = 'P0002';
  end if;
  if owner <> auth.uid() then
    raise exception 'Not your document' using errcode = '42501';
  end if;

  insert into public.document_jobs (document_id, kind, status)
  values (p_document_id, 'parse', 'queued')
  returning id into new_job_id;

  return new_job_id;
end;
$$;

grant execute on function public.enqueue_parse_job(uuid) to authenticated;

-- Phase 6: vector search RPC for chat RAG.
-- Returns top-K entries by cosine similarity within a subject.
-- security invoker = RLS on entries/chunks runs as the calling user.

create or replace function public.match_subject_entries(
  p_subject_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 8
)
returns table (
  id uuid,
  type text,
  payload_json jsonb,
  page_ref int,
  heading_path text,
  similarity float
)
language sql
stable
security invoker
as $$
  select
    e.id,
    e.type,
    e.payload_json,
    e.page_ref,
    c.heading_path,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.entries e
  join public.chunks c on c.id = e.source_chunk_id
  where e.subject_id = p_subject_id
    and e.embedding is not null
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_subject_entries(uuid, vector, int) to authenticated;

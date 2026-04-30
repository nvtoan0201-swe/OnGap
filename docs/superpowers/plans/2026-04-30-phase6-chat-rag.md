# Phase 6 — Chat RAG (per-subject Q&A with verbatim citations)

**Date:** 2026-04-30
**Branch:** `phase6-chat-rag` (off `origin/main`)

## Goal

Per-subject chat: user asks a question in Vietnamese → answer comes back grounded in the user's own slides, with **page + heading citations** quoted verbatim from the source.

This is the second study-UI surface and the most direct demo of the "verbatim extraction" moat.

## Architecture

```
Web (Next.js server action)
  POST http://127.0.0.1:4000/chat
  body: { subjectId, query, accessToken }
        |
        v
Worker HTTP endpoint
  1. Build per-request Supabase client w/ user JWT (RLS enforces ownership)
  2. embedQuery(query)            <- existing embedder
  3. rpc('match_subject_entries')  <- new SQL function, top-K cosine
  4. buildChatPrompt(query, hits) <- Vietnamese, verbatim rule
  5. askClaude({ model: 'haiku', prompt })
  6. respond { answer, citations: [{ page, heading_path, type, snippet }] }
```

**Why HTTP not queue:** chat needs synchronous-ish UX; queue + poll is overkill for MVP. Worker already runs locally during dev; deploy together.

**Auth model:** worker creates a fresh Supabase client per request using the user's access token. RLS on `entries` enforces that only the subject's owner can search. Worker's service-role key is NOT used for chat.

**One-shot, not streaming:** simplifies both sides. Streaming is a Phase 6.1 enhancement.

## Scope (in)

- Migration: `match_subject_entries(p_subject_id, p_query_embedding, p_match_count)` SQL function (security invoker).
- Worker:
  - `apps/worker/src/chat/prompt.ts` — Vietnamese prompt builder, verbatim rule, citation block format.
  - `apps/worker/src/chat/answer.ts` — embed → RPC → prompt → Claude → parse → return `{answer, citations}`.
  - `apps/worker/src/chat/server.ts` — minimal `node:http` POST `/chat` handler.
  - `apps/worker/src/supabase/user-client.ts` — factory for per-request user-scoped client.
  - `apps/worker/src/index.ts` — start HTTP server alongside poller.
  - Config: `CHAT_PORT` (default 4000).
- Web:
  - `apps/web/src/app/dashboard/subjects/[id]/chat/page.tsx` — SSR page (auth gate + subject load).
  - `apps/web/src/app/dashboard/subjects/[id]/chat/chat-window.tsx` — client component (input form, message list, citations).
  - `apps/web/src/app/dashboard/subjects/[id]/chat/chat-actions.ts` — `askChat` server action; reads access token from Supabase session, POSTs to worker.
  - Subject detail page: add "Hỏi đáp" card linking to `/chat`.
  - Config: `WORKER_CHAT_URL` (default `http://127.0.0.1:4000/chat`) in `apps/web/.env.local`.
- Tests:
  - `apps/worker/src/chat/prompt.test.ts` — formats top-K hits into prompt, includes verbatim instruction + citation block.
  - `apps/worker/src/chat/answer.test.ts` — full answer pipeline with mocked supabase RPC + mocked Claude.

## Scope (out — defer)

- Streaming responses.
- Chat history persistence (each turn is one-shot).
- Realtime updates / multi-tab sync.
- Citation hyperlinks back to source PDF page.
- Quiz, gap retry, exam prediction, MoMo, onboarding.
- Auth on `/chat` worker endpoint beyond the user JWT (no rate-limit, no IP allowlist — localhost-only in dev).

## SQL function

```sql
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
language sql stable security invoker as $$
  select
    e.id, e.type, e.payload_json, e.page_ref, c.heading_path,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.entries e
  join public.chunks c on c.id = e.source_chunk_id
  where e.subject_id = p_subject_id
    and e.embedding is not null
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;
```

`security invoker` means RLS on `entries` + `chunks` runs as the calling user — non-owners get empty results.

## Prompt shape (Vietnamese)

```
Bạn là trợ lý ôn thi cho sinh viên Việt Nam.

Quy tắc:
1. CHỈ dùng thông tin trong "Ngữ cảnh" bên dưới. Nếu không có, trả lời "Không tìm thấy trong tài liệu."
2. Trích dẫn nguyên văn (verbatim) — KHÔNG diễn giải lại.
3. Sau mỗi ý, ghi `[trang N — heading]`.

Ngữ cảnh:
[1] (concept, trang 12 — Chương 2 / Đệ quy)
   Đệ quy là kỹ thuật ...

[2] (formula, trang 18 — Chương 2 / Hàm sinh)
   T(n) = T(n-1) + n

Câu hỏi: {query}

Trả lời (tiếng Việt, có trích dẫn):
```

Output is plain text — UI shows it as-is, citations are inline `[trang N — ...]` strings.

## Manual verification (sign-off)

1. `npx supabase db reset` to apply the new migration.
2. `npm run worker` (boots poller + HTTP server on :4000).
3. `npm run web` → open a subject with at least one `done` document.
4. Click **Hỏi đáp** card → input box appears.
5. Ask "đệ quy là gì?" (or any topic from the slides) → answer renders with `[trang N — ...]` citations.
6. Ask something off-topic ("Donald Trump là ai?") → expect "Không tìm thấy trong tài liệu."
7. Open a subject with NO `done` documents → "Không tìm thấy" or empty state.
8. Try with another user's subject ID via URL guess → 404 (RLS).

## Tasks

1. Plan (this doc).
2. Migration `20260430000001_match_entries_rpc.sql`.
3. Worker chat module + tests.
4. Wire HTTP server into worker boot.
5. Web chat UI.
6. Verify (typecheck + worker tests).
7. README phase 6 status + commit + PR.

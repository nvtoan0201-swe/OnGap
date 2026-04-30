# ÔnGấp

App AI giúp sinh viên Việt Nam ôn thi cuối kỳ trong 3-7 ngày. Upload slide → AI trích xuất kiến thức (không tóm tắt) → flashcard verbatim + quiz adaptive + dự đoán đề.

## Development

Requirements:
- Node.js 20+
- Docker Desktop running (for local Supabase stack)
- `claude` CLI authenticated (`claude login`) — worker uses subscription, not API key
- Google OAuth 2.0 credentials from Google Cloud Console

Install:
```bash
npm install
```

Start local Supabase (requires Docker):
```bash
npx supabase start
# Copy the anon key + service_role key from the output into:
#   apps/web/.env.local           (NEXT_PUBLIC_SUPABASE_ANON_KEY)
#   apps/worker/.env              (SUPABASE_SERVICE_ROLE_KEY)
# And paste Google OAuth creds into .env at repo root.
```

Apply migrations:
```bash
npx supabase db reset
```

Run web:
```bash
npm run web
```

Run worker:
```bash
npm run worker
```

Run tests (worker only — needs `claude login` + downloads embedding model on first run):
```bash
npm test
```

Check domain availability:
```bash
npm run check-domains
```

See `docs/superpowers/specs/2026-04-23-ongap-design.md` for architecture.

## Phase 1 status (2026-04-23)

- [x] Monorepo skeleton (npm workspaces: `apps/web`, `apps/worker`)
- [x] Next.js 16.2 scaffold with TypeScript + Tailwind 4 + shadcn/ui (button, card, input, label)
- [x] Landing page (Vietnamese, hero + 3 feature cards)
- [x] Supabase local config + 15-table schema + RLS policies (5 migrations in `supabase/migrations/`)
- [x] Google OAuth config.toml wiring (env-var substitution — no secrets committed)
- [x] Supabase SSR client + middleware session refresh
- [x] Login page + `/auth/callback` route
- [x] Dashboard (list subjects) + create-subject server action
- [x] Node worker skeleton (`apps/worker`) with Zod config, JSON logger
- [x] **Claude Agent SDK tests passing**: Sonnet 4.6 + Haiku 4.5 roundtrip via subscription auth
- [x] **Local embedding tests passing**: `Xenova/multilingual-e5-base` (768d) on Vietnamese text, L2-normalized, cosine similarity verified
- [x] Domain probe script (`scripts/check-domains.mjs`) — run manually from unrestricted network

### User action items remaining for a complete Phase 1 sign-off

1. **Start Docker Desktop** then run `npx supabase start` — capture anon + service_role keys.
2. Paste anon key into `apps/web/.env.local`.
3. Paste service_role key into `apps/worker/.env`.
4. Create Google OAuth credentials at https://console.cloud.google.com/apis/credentials:
   - Authorized redirect URI: `http://127.0.0.1:54321/auth/v1/callback`
   - Paste client_id + secret into `.env` at repo root (template in `.env.example`).
5. Run `npx supabase db reset` to apply migrations.
6. Restart supabase (`npx supabase stop && npx supabase start`) to pick up Google OAuth.
7. Manual E2E: `npm run web` → http://localhost:3000 → login with Google → create a subject → verify row in `public.subjects` via `npx supabase studio`.
8. Run `npm run check-domains` from your normal shell (sandbox blocks DNS) and record the result.

## Phase 2 status (2026-04-23)

- [x] Migration `20260423000006_document_jobs.sql` — work queue table + `claim_next_document_job` (SKIP LOCKED) + `complete_document_job` RPCs, extends `documents.status` with `parsed`
- [x] Migration `20260423000007_storage_documents.sql` — private `documents` bucket (50 MB, PDF/DOCX/PPTX allowlist) + per-user folder RLS
- [x] Migration `20260423000008_enqueue_rpc.sql` — `enqueue_parse_job` SECURITY DEFINER callable by web app
- [x] Worker service-role Supabase client (`apps/worker/src/supabase/admin.ts`)
- [x] Parsers (all unit-tested): PDF via `pdf-parse` v2 (`PDFParse` class), DOCX via `mammoth.convertToMarkdown`, PPTX via `officeparser` v6 AST → per-slide `<!-- page: N -->` markers
- [x] OCR fallback: density heuristic (`<100 chars/page`) → `pdf-to-img` → `askClaudeVision` (writes to tmp file, Claude Code agent reads image with Read tool)
- [x] Parse orchestrator (`pipeline/parse-document.ts`) + queue poller (`queue/poller.ts`, 5 s interval, runs `runOnce` per tick)
- [x] Web: subject detail page (`/dashboard/subjects/[id]`) with upload form + doc list with status badges
- [x] Web: document preview page (`/dashboard/documents/[id]`) renders parsed markdown
- [x] Dashboard cards now link to subject detail
- [x] Worker test suite: 9 tests green (pdf/docx/pptx parsers, ocr with mocked vision, parse-document orchestrator, poller claim/success/failure)
- [x] Web `next build` passes, including two new dynamic routes

### User action items for Phase 2 sign-off (manual, need Docker + auth)

1. `npx supabase start` → apply new migrations with `npx supabase db reset`.
2. `npm run web` + `npm run worker` in parallel terminals.
3. Log in → create a subject → open it → upload `apps/worker/test-fixtures/sample-text.pdf`.
4. Watch worker logs: `job claimed → parsed`. Refresh UI → status flips `pending → parsing → parsed`, "Xem" link appears.
5. Open preview page → verify markdown contains `<!-- page: 1 -->` / `<!-- page: 2 -->` and Latin heading text.
6. Upload a scanned PDF (or the sample.pdf rastered via ghostscript) → worker log should show `pdf density low, falling back to OCR` and per-page `ocr page` entries.
7. Upload `sample.docx` and `sample.pptx` → should go straight to `parsed` with correct markdown.

## Phase 3 status (2026-04-28)

- [x] Token approximator (`chunking/tokens.ts`, ~4 chars/token)
- [x] Heading-aware chunker (`chunking/chunker.ts`): splits at H1/H2 boundaries, preserves heading path + `<!-- page: N -->` ranges, paragraph-level overlap (~200 tokens) when a section >3000 tokens, single `(toàn văn)` chunk for headless documents
- [x] Extraction Zod schemas (`extraction/schemas.ts`): discriminated union `concept | example | formula`, batched per-chunk shape with strict validation
- [x] Vietnamese extraction prompt (`extraction/prompt.ts`): "trích xuất, không tóm tắt", explicit verbatim rule, JSON-only output
- [x] Batched extractor (`extraction/extract.ts`): Haiku 4.5 via `askClaude`, JSON array fence-tolerant, recursive half-split retry on parse/validation failure, single-chunk failure returns `[]` instead of killing the document
- [x] Pipeline orchestrator (`pipeline/process-document.ts`): `parsed → chunking → extracting → done` with embed-and-insert into `chunks` (768d) and `entries` (768d), 5-chunk extraction batches, 50-row entry insert batches, `failed` on any error
- [x] `parseDocument` chains into `processDocument` so the same job run goes all the way to `done`
- [x] Worker test suite: 23 tests green (chunker × 4, extract × 4, process-document × 2, plus Phase 1/2 tests)

### User action items for Phase 3 sign-off (manual, need Docker + auth + claude login)

1. `npm run worker` (Phase 2 setup must already be applied).
2. From the dashboard, upload a real slide PDF (a few hundred KB, with headings).
3. Watch the worker logs roll through: `job claimed → parsed → chunked {chunks: N} → extracted batch → extraction complete → job done`.
4. In Supabase Studio: `select count(*) from public.chunks where document_id = '<id>';` should return N. `select type, count(*) from public.entries where source_chunk_id in (...) group by type;` should show concept/example/formula entries with non-null `embedding`.
5. Spot-check a concept's `payload_json -> 'definition_verbatim'` to confirm the text is verbatim from the slide (not paraphrased).
6. Try a slide with no headings → should produce a single `(toàn văn)` chunk and still extract entries.
7. Try an oversized single-section document → expect ≥2 chunks with overlapping paragraphs.

## Phase 4 status (2026-04-28)

- [x] Audit Zod schemas (`audit/schemas.ts`): `coverage_pct` 0..100, `gaps[]` with `heading_path` + `reason`
- [x] Vietnamese audit prompt (`audit/prompt.ts`): outline vs entries comparison, JSON-object output (not array)
- [x] Coverage audit module (`audit/audit.ts`): Sonnet 4.6 via `askClaude({model:'sonnet'})`, fence-tolerant JSON-object parser, **non-fatal** on LLM/JSON failure (records `coverage_pct = 0` + empty gaps + continues)
- [x] Flashcard derivation (`generation/flashcards.ts`): pure SQL, 1 concept entry → 1 flashcard row, idempotent (skips entries that already have a flashcard), batched insert (100 rows/batch)
- [x] Pipeline orchestrator extended: `extracting → auditing → done`, audit + flashcards run after entries are inserted, audit failure is informational, flashcard failure marks document `failed`
- [x] `extractAndInsertEntries` now returns inserted entries (id + type + payload + page_ref) so audit + flashcards can use them without a re-fetch
- [x] Worker test suite: 30 tests green (audit × 3, flashcards × 4, process-document × 3, plus Phase 1-3 tests)

### User action items for Phase 4 sign-off (manual, need Docker + auth + claude login)

1. `npm run worker` (Phase 2/3 setup must already be applied).
2. Re-process the same slide PDF you used for Phase 3 sign-off.
3. Worker logs roll: `… → extraction complete → audit recorded {coveragePct: X, gaps: N} → flashcards derived {inserted: M} → job done`.
4. Supabase Studio:
   - `select coverage_pct, jsonb_array_length(gaps_json) from public.coverage_audits where document_id = '<id>';` → returns 1 row, coverage 0-100.
   - `select count(*) from public.flashcards where subject_id = '<subject>';` → equals the number of `concept` entries from that document.
   - `select front, back_verbatim, page_ref, difficulty from public.flashcards limit 5;` → spot-check that `back_verbatim` is verbatim from the slide.
5. Re-run the same document a second time → flashcard count stays the same (idempotent skip).
6. Force a Sonnet failure (e.g. unplug network briefly) → document still ends `done`, `coverage_audits` row still inserted with `coverage_pct = 0`.

## Phase 6 status (2026-04-30)

- [x] Migration `20260430000001_match_entries_rpc.sql` — `match_subject_entries(subject_id, query_embedding, k)` SQL function (security invoker, joins `entries → chunks` for `heading_path`, returns top-K by cosine distance).
- [x] Worker chat module:
  - `chat/prompt.ts` — Vietnamese prompt builder, verbatim rule, numbered citation blocks (`[trang N — heading]`).
  - `chat/answer.ts` — `embed → match_subject_entries RPC → buildChatPrompt → askClaude({model:'haiku'})`. Empty-hits short-circuits to `Không tìm thấy trong tài liệu.` without calling Claude.
  - `chat/server.ts` — `node:http` POST `/chat` (Zod-validated body, 4 KB cap, `127.0.0.1`-bound) + `GET /health`.
- [x] Worker boot: `index.ts` starts `startChatServer(config.CHAT_PORT)` alongside the document-job poller. `CHAT_PORT` defaults to `4000`.
- [x] Web `askChat` server action: verifies subject ownership via RLS, then forwards to `WORKER_CHAT_URL` (default `http://127.0.0.1:4000/chat`).
- [x] Web `/dashboard/subjects/[id]/chat` SSR page + `ChatWindow` client component (form, message list, expandable citation block, error + pending states).
- [x] Subject detail page: new "Hỏi đáp" card linking into `/chat`.
- [x] Worker test suite: 43 tests green (chat prompt × 7, chat answer × 5, plus Phase 1–4 tests).
- [x] Web typecheck clean.

### User action items for Phase 6 sign-off (manual, need Docker + auth + claude login)

1. `npx supabase db reset` (applies the new migration).
2. `npm run worker` — boots poller + chat HTTP server (`chat server listening {port: 4000}`).
3. `npm run web` → open a subject with at least one `done` document → click **Mở hỏi đáp** card.
4. Ask "đệ quy là gì?" (or any topic from the slides) → answer renders with `[trang N — ...]` citations and an expandable citation list.
5. Ask something off-topic ("Donald Trump là ai?") → expect `Không tìm thấy trong tài liệu.` with empty citation list.
6. Open a subject with NO `done` documents → same `Không tìm thấy` answer.
7. Try with another user's subject ID via URL guess → `Không tìm thấy môn hoặc không phải của bạn.` (RLS via the server action).
8. Stop worker → ask a question → expect `Worker lỗi` error message in the chat window.

Next: Phase 7 — quiz generation + gap retry loop.

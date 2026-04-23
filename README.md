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

Next: Phase 3 — heading-aware chunking + batched Claude extraction + pgvector embedding.

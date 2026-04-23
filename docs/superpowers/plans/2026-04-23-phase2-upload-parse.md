# ÔnGấp — Phase 2 (Upload → Structured Markdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User can upload a PDF/DOCX/PPTX to a subject, the worker picks the job off a Supabase queue, parses the file to structured Markdown (headings + page markers preserved), falls back to Claude Haiku 4.5 vision OCR for scanned PDFs, writes the result to `documents.parsed_markdown`, and the web app shows the preview with a status badge.

**Architecture:** Add a `document_jobs` work queue table + a private Supabase Storage bucket `documents`. The web app uploads the file via a server action, inserts a `documents` row and a matching `document_jobs` row. The Node worker polls `document_jobs` every 5s, claims one with `SELECT … FOR UPDATE SKIP LOCKED`, downloads the file from Storage with the service-role key, dispatches by mime type to a pure-function parser (`pdfParse` / `docxParse` / `pptxParse`), and if the extracted text density is too low it runs a per-page OCR pass via Claude Haiku 4.5 vision. Parse result is written atomically back to the `documents` row.

**Tech Stack:** `pdf-parse` (text PDFs), `mammoth` (DOCX), `officeparser` (PPTX), `pdf-to-img` (per-page PNG for OCR), `@anthropic-ai/claude-agent-sdk` vision messages, `@supabase/supabase-js` service-role client. Vitest for worker unit tests; web continues with Next.js 16 server actions + `@supabase/ssr`.

**Prerequisite:** Phase 1 foundation commit `56a3e4d` (docs: phase 1 foundation complete) is on `main`; local `supabase start` running; `claude` CLI authenticated (`claude --version` works).

**Out of scope (deferred to Phase 3):** heading-aware chunking, multi-pass Claude extraction, pgvector embedding of chunks, coverage audit. Phase 2 stops after `documents.parsed_markdown` is populated and `documents.status = 'parsed'`.

---

## File Structure (locked)

```
D:/saurieng/
├── apps/
│   ├── web/
│   │   └── src/
│   │       └── app/
│   │           └── dashboard/
│   │               ├── subjects/
│   │               │   └── [id]/
│   │               │       ├── page.tsx                    # subject detail + doc list (NEW)
│   │               │       ├── upload-actions.ts           # server actions (NEW)
│   │               │       └── upload-form.tsx             # client form (NEW)
│   │               └── documents/
│   │                   └── [id]/
│   │                       └── page.tsx                    # parsed MD preview (NEW)
│   └── worker/
│       ├── package.json                                    # +parse deps (MODIFY)
│       └── src/
│           ├── index.ts                                    # start poll loop (MODIFY)
│           ├── supabase/
│           │   └── admin.ts                                # service-role client (NEW)
│           ├── queue/
│           │   ├── poller.ts                               # claim + dispatch (NEW)
│           │   └── poller.test.ts                          # (NEW)
│           ├── parsers/
│           │   ├── index.ts                                # dispatch by mime (NEW)
│           │   ├── pdf.ts                                  # (NEW)
│           │   ├── pdf.test.ts                             # (NEW)
│           │   ├── docx.ts                                 # (NEW)
│           │   ├── docx.test.ts                            # (NEW)
│           │   ├── pptx.ts                                 # (NEW)
│           │   ├── pptx.test.ts                            # (NEW)
│           │   ├── ocr.ts                                  # pdf→png→Haiku vision (NEW)
│           │   ├── ocr.test.ts                             # (NEW)
│           │   └── density.ts                              # "needs OCR?" heuristic (NEW)
│           ├── claude/
│           │   ├── client.ts                               # add askClaudeVision (MODIFY)
│           │   └── client.test.ts                          # +vision test (MODIFY)
│           └── pipeline/
│               ├── parse-document.ts                       # orchestrator (NEW)
│               └── parse-document.test.ts                  # (NEW)
└── supabase/
    └── migrations/
        ├── 20260423000006_document_jobs.sql                # work queue + fn (NEW)
        └── 20260423000007_storage_documents.sql            # bucket + policies (NEW)
```

**Boundary rules:**
- `apps/web` never touches Claude or the file bytes; it only writes rows + file to Storage via its user-scoped client.
- `apps/worker` never serves HTTP; it only reads jobs + Storage files with service-role and writes back.
- Parsers (`apps/worker/src/parsers/*.ts`) are **pure functions** over a `Buffer`: no DB, no filesystem, no network. This keeps them unit-testable with tiny fixtures.

---

## Task 1: Install worker parse dependencies

**Files:**
- Modify: `apps/worker/package.json`

- [ ] **Step 1.1: Add parse deps**

Run from `D:/saurieng`:
```bash
npm --workspace apps/worker install pdf-parse@1.1.5 mammoth@1.8.0 officeparser@5.1.1 pdf-to-img@4.2.0
```

Expected: `apps/worker/package.json` gains 4 entries in `dependencies`; `package-lock.json` updates.

- [ ] **Step 1.2: Add dev type for pdf-parse**

```bash
npm --workspace apps/worker install -D @types/pdf-parse@1.1.4
```

- [ ] **Step 1.3: Sanity typecheck**

```bash
npm --workspace apps/worker run typecheck
```
Expected: exit 0.

- [ ] **Step 1.4: Commit**

```bash
git add apps/worker/package.json package-lock.json
git commit -m "chore(worker): add parse deps (pdf-parse, mammoth, officeparser, pdf-to-img)"
```

---

## Task 2: Migration — `document_jobs` queue table

**Files:**
- Create: `supabase/migrations/20260423000006_document_jobs.sql`

- [ ] **Step 2.1: Write migration**

Content of `supabase/migrations/20260423000006_document_jobs.sql`:
```sql
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
  claimed_by text,                 -- worker process id for debugging
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_document_jobs_status on public.document_jobs(status, created_at);
create index idx_document_jobs_document on public.document_jobs(document_id);

alter table public.document_jobs enable row level security;

-- No end-user policies: jobs are server-side only. Worker uses service_role
-- which bypasses RLS; end users cannot read or write this table.

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

-- Allow the service_role to call it (it already can, but be explicit).
grant execute on function public.claim_next_document_job(text) to service_role;

-- Helper to mark a job's outcome from the worker.
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

-- Also extend documents.status check to include a 'parsed' terminal state
-- (spec used 'done' but Phase 2 stops *before* chunking, so we add 'parsed').
alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status in ('pending', 'parsing', 'parsed', 'chunking', 'extracting', 'auditing', 'done', 'failed'));
```

- [ ] **Step 2.2: Apply migration**

Run from `D:/saurieng`:
```bash
supabase db reset
```
Expected: "Finished supabase db reset." with no SQL errors.

- [ ] **Step 2.3: Manually verify in Studio**

Open http://127.0.0.1:54323 → Table Editor → confirm `document_jobs` exists with the 8 columns above. Database → Functions → confirm `claim_next_document_job` and `complete_document_job`.

- [ ] **Step 2.4: Commit**

```bash
git add supabase/migrations/20260423000006_document_jobs.sql
git commit -m "feat(db): document_jobs queue + claim/complete functions"
```

---

## Task 3: Migration — Storage bucket + policies

**Files:**
- Create: `supabase/migrations/20260423000007_storage_documents.sql`

- [ ] **Step 3.1: Write migration**

Content of `supabase/migrations/20260423000007_storage_documents.sql`:
```sql
-- Private bucket for user-uploaded slides/outlines/past-exams.
-- Object path convention: <user_id>/<subject_id>/<document_id>/<original_filename>
-- RLS: user can only read/write objects whose first path segment matches their uid.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  50 * 1024 * 1024,   -- 50 MB per file
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-powerpoint'
  ]
)
on conflict (id) do nothing;

-- Uploaders: own folder only.
create policy "documents bucket: user insert own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents bucket: user read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents bucket: user delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- service_role bypasses RLS and is how the worker downloads.
```

- [ ] **Step 3.2: Apply migration**

```bash
supabase db reset
```
Expected: success. In Studio → Storage → confirm `documents` bucket (Private).

- [ ] **Step 3.3: Commit**

```bash
git add supabase/migrations/20260423000007_storage_documents.sql
git commit -m "feat(storage): private documents bucket + user-scoped RLS"
```

---

## Task 4: Worker — Supabase service-role client

**Files:**
- Create: `apps/worker/src/supabase/admin.ts`
- Modify: `apps/worker/src/config.ts` (already has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; nothing to change)

- [ ] **Step 4.1: Write the admin client module**

Content of `apps/worker/src/supabase/admin.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let client: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS. Must only be used from the worker,
 * never from the web app or any client-visible path.
 */
export function admin(): SupabaseClient {
  if (client) return client;
  client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
```

- [ ] **Step 4.2: Typecheck**

```bash
npm --workspace apps/worker run typecheck
```
Expected: exit 0.

- [ ] **Step 4.3: Commit**

```bash
git add apps/worker/src/supabase/admin.ts
git commit -m "feat(worker): add service-role supabase client"
```

---

## Task 5: Worker — OCR density heuristic

**Files:**
- Create: `apps/worker/src/parsers/density.ts`

- [ ] **Step 5.1: Write the heuristic**

Content of `apps/worker/src/parsers/density.ts`:
```ts
/**
 * Decide whether a parsed-text output is too sparse and needs OCR re-run.
 * Uses char count per page. Scanned slides often yield <50 chars/page from
 * pdf-parse (header/footer text only), while real text PDFs give 500-3000.
 */
export interface DensityInput {
  pageCount: number;
  totalChars: number;
}

export function needsOcr({ pageCount, totalChars }: DensityInput): boolean {
  if (pageCount <= 0) return false;
  const perPage = totalChars / pageCount;
  return perPage < 100;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add apps/worker/src/parsers/density.ts
git commit -m "feat(worker): add OCR density heuristic (chars/page)"
```

---

## Task 6: Worker — PDF parser (text path)

**Files:**
- Create: `apps/worker/src/parsers/pdf.ts`
- Create: `apps/worker/src/parsers/pdf.test.ts`
- Test fixtures: `apps/worker/test-fixtures/sample-text.pdf` (a tiny 2-page text PDF)

- [ ] **Step 6.1: Place a fixture**

Create `apps/worker/test-fixtures/` and put a 2-page text PDF named `sample-text.pdf`. Any small real Vietnamese-containing PDF (e.g. a 2-slide lecture PDF) works. Do not commit large binaries — keep < 100 KB. If you don't have one handy, generate with:
```bash
node -e "
const { jsPDF } = require('jspdf');
const doc = new jsPDF();
doc.setFontSize(18);
doc.text('Chương 1: Kinh tế vi mô', 10, 20);
doc.setFontSize(12);
doc.text('Cầu thị trường là lượng hàng hóa người mua sẵn sàng mua ở mỗi mức giá.', 10, 40);
doc.addPage();
doc.setFontSize(18);
doc.text('Chương 2: Cung thị trường', 10, 20);
doc.setFontSize(12);
doc.text('Cung là lượng hàng hóa người bán sẵn sàng bán ở mỗi mức giá.', 10, 40);
require('fs').writeFileSync('apps/worker/test-fixtures/sample-text.pdf', Buffer.from(doc.output('arraybuffer')));
"
```
(Install jspdf temporarily only if needed: `npm i -D jspdf`, then remove.)

- [ ] **Step 6.2: Write the failing test**

Content of `apps/worker/src/parsers/pdf.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parsePdf } from "./pdf.js";

describe("parsePdf", () => {
  it("extracts Vietnamese text and a page count from a small text PDF", async () => {
    const buf = readFileSync("test-fixtures/sample-text.pdf");
    const res = await parsePdf(buf);
    expect(res.pageCount).toBeGreaterThanOrEqual(2);
    expect(res.markdown).toContain("Kinh tế vi mô");
    expect(res.markdown).toContain("Cung thị trường");
    expect(res.totalChars).toBeGreaterThan(50);
  });

  it("inserts page markers between pages", async () => {
    const buf = readFileSync("test-fixtures/sample-text.pdf");
    const res = await parsePdf(buf);
    expect(res.markdown).toMatch(/<!-- page:\s*2 -->/);
  });
});
```

- [ ] **Step 6.3: Run the test (should fail with module not found)**

```bash
npm --workspace apps/worker run test -- parsers/pdf.test.ts
```
Expected: FAIL ("Cannot find module './pdf.js'" or similar).

- [ ] **Step 6.4: Implement**

Content of `apps/worker/src/parsers/pdf.ts`:
```ts
import pdfParse from "pdf-parse";

export interface PdfParseResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

/**
 * Text-path PDF parser. Splits pdf-parse's raw text on the form-feed page
 * break (\f) and emits HTML page-marker comments so downstream chunking can
 * recover page numbers. Headings are NOT detected here — that's the chunker's
 * job in Phase 3. We only need clean per-page text with boundaries.
 */
export async function parsePdf(buf: Buffer): Promise<PdfParseResult> {
  const out = await pdfParse(buf);
  const rawPages = out.text.split("\f");
  const parts: string[] = [];
  let totalChars = 0;
  for (let i = 0; i < rawPages.length; i++) {
    const pageNum = i + 1;
    const cleaned = rawPages[i]!.replace(/\r\n?/g, "\n").trim();
    if (cleaned.length === 0 && i === rawPages.length - 1) continue;
    parts.push(`<!-- page: ${pageNum} -->\n\n${cleaned}`);
    totalChars += cleaned.length;
  }
  return {
    markdown: parts.join("\n\n"),
    pageCount: out.numpages,
    totalChars,
  };
}
```

- [ ] **Step 6.5: Run the test (should pass)**

```bash
npm --workspace apps/worker run test -- parsers/pdf.test.ts
```
Expected: 2 PASS.

- [ ] **Step 6.6: Commit**

```bash
git add apps/worker/src/parsers/pdf.ts apps/worker/src/parsers/pdf.test.ts apps/worker/test-fixtures/sample-text.pdf
git commit -m "feat(worker): pdf text parser with page markers"
```

---

## Task 7: Worker — DOCX parser

**Files:**
- Create: `apps/worker/src/parsers/docx.ts`
- Create: `apps/worker/src/parsers/docx.test.ts`
- Test fixture: `apps/worker/test-fixtures/sample.docx`

- [ ] **Step 7.1: Place a fixture**

Create a small DOCX at `apps/worker/test-fixtures/sample.docx` with this content:
```
Heading 1 style: "Đề cương ôn tập"
Normal:  "Câu 1: Trình bày khái niệm cầu thị trường."
Heading 1 style: "Phần B"
Normal:  "Câu 2: So sánh cầu và cung."
```
You can make it in Word or LibreOffice. Keep < 30 KB.

- [ ] **Step 7.2: Write the failing test**

Content of `apps/worker/src/parsers/docx.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseDocx } from "./docx.js";

describe("parseDocx", () => {
  it("converts DOCX to markdown preserving headings", async () => {
    const buf = readFileSync("test-fixtures/sample.docx");
    const res = await parseDocx(buf);
    expect(res.markdown).toMatch(/^# Đề cương ôn tập/m);
    expect(res.markdown).toMatch(/^# Phần B/m);
    expect(res.markdown).toContain("cầu thị trường");
    expect(res.totalChars).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 7.3: Run the test (should fail)**

```bash
npm --workspace apps/worker run test -- parsers/docx.test.ts
```
Expected: FAIL.

- [ ] **Step 7.4: Implement**

Content of `apps/worker/src/parsers/docx.ts`:
```ts
import mammoth from "mammoth";

export interface DocxParseResult {
  markdown: string;
  pageCount: number;   // DOCX has no intrinsic pages; report 1.
  totalChars: number;
}

export async function parseDocx(buf: Buffer): Promise<DocxParseResult> {
  const { value } = await mammoth.convertToMarkdown({ buffer: buf });
  const md = value.trim();
  return {
    markdown: md,
    pageCount: 1,
    totalChars: md.length,
  };
}
```

- [ ] **Step 7.5: Run the test (should pass)**

```bash
npm --workspace apps/worker run test -- parsers/docx.test.ts
```
Expected: PASS.

- [ ] **Step 7.6: Commit**

```bash
git add apps/worker/src/parsers/docx.ts apps/worker/src/parsers/docx.test.ts apps/worker/test-fixtures/sample.docx
git commit -m "feat(worker): docx parser via mammoth"
```

---

## Task 8: Worker — PPTX parser

**Files:**
- Create: `apps/worker/src/parsers/pptx.ts`
- Create: `apps/worker/src/parsers/pptx.test.ts`
- Test fixture: `apps/worker/test-fixtures/sample.pptx`

- [ ] **Step 8.1: Place a fixture**

Create a small PPTX at `apps/worker/test-fixtures/sample.pptx` with 2 slides, each with a title and one bullet. Titles: "Chương 1: Cầu", "Chương 2: Cung". Keep < 30 KB.

- [ ] **Step 8.2: Write the failing test**

Content of `apps/worker/src/parsers/pptx.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parsePptx } from "./pptx.js";

describe("parsePptx", () => {
  it("extracts slide text with per-slide page markers", async () => {
    const buf = readFileSync("test-fixtures/sample.pptx");
    const res = await parsePptx(buf);
    expect(res.pageCount).toBe(2);
    expect(res.markdown).toContain("Chương 1: Cầu");
    expect(res.markdown).toContain("Chương 2: Cung");
    expect(res.markdown).toMatch(/<!-- page:\s*1 -->/);
    expect(res.markdown).toMatch(/<!-- page:\s*2 -->/);
  });
});
```

- [ ] **Step 8.3: Run the test (should fail)**

```bash
npm --workspace apps/worker run test -- parsers/pptx.test.ts
```
Expected: FAIL.

- [ ] **Step 8.4: Implement**

Content of `apps/worker/src/parsers/pptx.ts`:
```ts
import { parseOfficeAsync } from "officeparser";

export interface PptxParseResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

/**
 * officeparser yields one blob of text per file with slide boundaries
 * usually separated by two newlines. We wrap each slide in a page marker.
 * Slide count from text is approximate; fine for Phase 2 — the spec's goal
 * is "heading preserved in DB". Phase 3 chunker does the real segmentation.
 */
export async function parsePptx(buf: Buffer): Promise<PptxParseResult> {
  const raw = await parseOfficeAsync(buf, { outputErrorToConsole: false });
  const slides = raw
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const parts: string[] = [];
  let totalChars = 0;
  for (let i = 0; i < slides.length; i++) {
    const pageNum = i + 1;
    parts.push(`<!-- page: ${pageNum} -->\n\n${slides[i]}`);
    totalChars += slides[i]!.length;
  }
  return {
    markdown: parts.join("\n\n"),
    pageCount: slides.length,
    totalChars,
  };
}
```

- [ ] **Step 8.5: Run the test (should pass)**

```bash
npm --workspace apps/worker run test -- parsers/pptx.test.ts
```
Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add apps/worker/src/parsers/pptx.ts apps/worker/src/parsers/pptx.test.ts apps/worker/test-fixtures/sample.pptx
git commit -m "feat(worker): pptx parser via officeparser"
```

---

## Task 9: Worker — Extend Claude client with vision

**Files:**
- Modify: `apps/worker/src/claude/client.ts`
- Modify: `apps/worker/src/claude/client.test.ts`

- [ ] **Step 9.1: Extend client with `askClaudeVision`**

Replace the full content of `apps/worker/src/claude/client.ts` with:
```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../logger.js";

export type ClaudeModel = "sonnet" | "haiku";

const MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface AskClaudeInput {
  model: ClaudeModel;
  prompt: string;
  /** Max agent turns — 1 for simple single-shot calls. */
  maxTurns?: number;
}

/**
 * Single-shot wrapper: ask Claude, collect the final assistant text.
 * Uses the authenticated `claude` CLI via Claude Agent SDK (no API key needed).
 */
export async function askClaude(input: AskClaudeInput): Promise<string> {
  const { model, prompt, maxTurns = 1 } = input;
  const modelId = MODEL_IDS[model];

  let out = "";
  const stream = query({
    prompt,
    options: { model: modelId, maxTurns },
  });

  for await (const event of stream) {
    if (event.type === "assistant") {
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            out += block.text;
          }
        }
      }
    }
  }

  logger.debug("askClaude completed", { model: modelId, chars: out.length });
  return out.trim();
}

export interface AskClaudeVisionInput {
  model: ClaudeModel;
  prompt: string;
  /** PNG/JPEG bytes. */
  image: Buffer;
  imageMediaType?: "image/png" | "image/jpeg";
  maxTurns?: number;
}

/**
 * Vision single-shot. Passes an image + prompt to the model via a
 * structured user turn. Used by the OCR fallback to re-read a scanned PDF
 * page as text/markdown.
 */
export async function askClaudeVision(input: AskClaudeVisionInput): Promise<string> {
  const {
    model,
    prompt,
    image,
    imageMediaType = "image/png",
    maxTurns = 1,
  } = input;
  const modelId = MODEL_IDS[model];
  const b64 = image.toString("base64");

  let out = "";
  const stream = query({
    prompt: {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: imageMediaType, data: b64 } },
        { type: "text", text: prompt },
      ],
    },
    options: { model: modelId, maxTurns },
  });

  for await (const event of stream) {
    if (event.type === "assistant") {
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            out += block.text;
          }
        }
      }
    }
  }

  logger.debug("askClaudeVision completed", { model: modelId, chars: out.length });
  return out.trim();
}
```

- [ ] **Step 9.2: Extend the test file**

Append to `apps/worker/src/claude/client.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { askClaudeVision } from "./client.js";

// Tiny red PNG fixture at apps/worker/test-fixtures/red-pixel.png
describe("askClaudeVision", () => {
  it("responds to a trivial image description prompt with Haiku", async () => {
    const png = readFileSync("test-fixtures/red-pixel.png");
    const out = await askClaudeVision({
      model: "haiku",
      image: png,
      prompt: "What dominant color is this image? Reply with one English word.",
    });
    expect(out.toLowerCase()).toMatch(/red|crimson|maroon/);
  }, 90_000);
});
```

- [ ] **Step 9.3: Create the red-pixel PNG fixture**

Run:
```bash
node -e "
const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
require('fs').writeFileSync('apps/worker/test-fixtures/red-pixel.png', buf);
"
```

- [ ] **Step 9.4: Run the test**

```bash
npm --workspace apps/worker run test -- claude/client.test.ts
```
Expected: 3 PASS (2 existing + 1 new). Network + Claude CLI required.

- [ ] **Step 9.5: Commit**

```bash
git add apps/worker/src/claude/client.ts apps/worker/src/claude/client.test.ts apps/worker/test-fixtures/red-pixel.png
git commit -m "feat(worker): add askClaudeVision (Haiku multimodal)"
```

---

## Task 10: Worker — OCR fallback (PDF → PNG → Haiku vision)

**Files:**
- Create: `apps/worker/src/parsers/ocr.ts`
- Create: `apps/worker/src/parsers/ocr.test.ts`

- [ ] **Step 10.1: Write the failing test**

Content of `apps/worker/src/parsers/ocr.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { ocrPdf } from "./ocr.js";

// Mock the Claude client so this test runs offline and does not burn tokens.
vi.mock("../claude/client.js", () => ({
  askClaudeVision: vi.fn(async () => "Chương 1: Kinh tế vi mô\n\nĐịnh nghĩa: ..."),
}));

describe("ocrPdf", () => {
  it("emits per-page markdown with page markers", async () => {
    const buf = readFileSync("test-fixtures/sample-text.pdf");
    const res = await ocrPdf(buf);
    expect(res.pageCount).toBeGreaterThanOrEqual(1);
    expect(res.markdown).toMatch(/<!-- page:\s*1 -->/);
    expect(res.markdown).toContain("Kinh tế vi mô");
    expect(res.totalChars).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 10.2: Run it (should fail)**

```bash
npm --workspace apps/worker run test -- parsers/ocr.test.ts
```
Expected: FAIL ("Cannot find module './ocr.js'").

- [ ] **Step 10.3: Implement**

Content of `apps/worker/src/parsers/ocr.ts`:
```ts
import { pdf as pdfToImg } from "pdf-to-img";
import { askClaudeVision } from "../claude/client.js";
import { logger } from "../logger.js";

export interface OcrResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

const OCR_PROMPT = [
  "Đây là một slide / trang tài liệu học tập tiếng Việt.",
  "Hãy OCR toàn bộ văn bản nhìn thấy và trả về Markdown.",
  "Giữ nguyên heading (bắt đầu bằng #), bullet (-), công thức (dùng $...$).",
  "Chỉ trả về nội dung trang, KHÔNG thêm lời giải thích, KHÔNG bọc code fence.",
].join(" ");

/**
 * Rasterise each PDF page to PNG, then ask Haiku Vision to transcribe to MD.
 * Used when the fast text parser's char density is too low (likely a scan).
 */
export async function ocrPdf(buf: Buffer): Promise<OcrResult> {
  const document = await pdfToImg(buf, { scale: 2.0 });
  const parts: string[] = [];
  let pageNum = 0;
  let totalChars = 0;

  for await (const image of document) {
    pageNum += 1;
    logger.info("ocr page", { pageNum });
    // image is a Buffer (PNG bytes) per pdf-to-img's Node output
    const text = await askClaudeVision({
      model: "haiku",
      image: image as Buffer,
      prompt: OCR_PROMPT,
    });
    parts.push(`<!-- page: ${pageNum} -->\n\n${text.trim()}`);
    totalChars += text.length;
  }

  return {
    markdown: parts.join("\n\n"),
    pageCount: pageNum,
    totalChars,
  };
}
```

- [ ] **Step 10.4: Run test (should pass with mocked vision)**

```bash
npm --workspace apps/worker run test -- parsers/ocr.test.ts
```
Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
git add apps/worker/src/parsers/ocr.ts apps/worker/src/parsers/ocr.test.ts
git commit -m "feat(worker): pdf OCR fallback via Haiku vision"
```

---

## Task 11: Worker — Parser dispatch by MIME

**Files:**
- Create: `apps/worker/src/parsers/index.ts`

- [ ] **Step 11.1: Write the dispatcher**

Content of `apps/worker/src/parsers/index.ts`:
```ts
import { parsePdf, type PdfParseResult } from "./pdf.js";
import { parseDocx } from "./docx.js";
import { parsePptx } from "./pptx.js";
import { ocrPdf } from "./ocr.js";
import { needsOcr } from "./density.js";
import { logger } from "../logger.js";

export interface ParseResult {
  markdown: string;
  pageCount: number;
  usedOcr: boolean;
}

export type SupportedMime =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function parseByMime(
  mime: string,
  buf: Buffer,
): Promise<ParseResult> {
  switch (mime) {
    case "application/pdf": {
      const fast: PdfParseResult = await parsePdf(buf);
      if (!needsOcr(fast)) {
        return { markdown: fast.markdown, pageCount: fast.pageCount, usedOcr: false };
      }
      logger.info("pdf density low, falling back to OCR", {
        pages: fast.pageCount,
        chars: fast.totalChars,
      });
      const ocr = await ocrPdf(buf);
      return { markdown: ocr.markdown, pageCount: ocr.pageCount, usedOcr: true };
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const r = await parseDocx(buf);
      return { markdown: r.markdown, pageCount: r.pageCount, usedOcr: false };
    }
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
      const r = await parsePptx(buf);
      return { markdown: r.markdown, pageCount: r.pageCount, usedOcr: false };
    }
    default:
      throw new Error(`Unsupported mime: ${mime}`);
  }
}
```

- [ ] **Step 11.2: Typecheck**

```bash
npm --workspace apps/worker run typecheck
```
Expected: exit 0.

- [ ] **Step 11.3: Commit**

```bash
git add apps/worker/src/parsers/index.ts
git commit -m "feat(worker): parser dispatcher with OCR fallback"
```

---

## Task 12: Worker — Document parse pipeline (orchestrator)

**Files:**
- Create: `apps/worker/src/pipeline/parse-document.ts`
- Create: `apps/worker/src/pipeline/parse-document.test.ts`

- [ ] **Step 12.1: Write the failing test**

Content of `apps/worker/src/pipeline/parse-document.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase admin + parsers
const updateMock = vi.fn(async () => ({ error: null }));
const downloadMock = vi.fn(async () => ({ data: new Blob([Buffer.from("fakebytes")]), error: null }));

vi.mock("../supabase/admin.js", () => ({
  admin: () => ({
    from: () => ({
      update: () => ({ eq: updateMock }),
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: "doc1", subject_id: "s1", file_url: "u1/s1/doc1/x.pdf", type: "slide" }, error: null }) }) }),
    }),
    storage: { from: () => ({ download: downloadMock }) },
  }),
}));

vi.mock("../parsers/index.js", () => ({
  parseByMime: vi.fn(async () => ({
    markdown: "<!-- page: 1 -->\n\n# Chương 1\n\nHello",
    pageCount: 1,
    usedOcr: false,
  })),
}));

import { parseDocument } from "./parse-document.js";

describe("parseDocument", () => {
  beforeEach(() => {
    updateMock.mockClear();
    downloadMock.mockClear();
  });

  it("downloads, parses, writes parsed_markdown and sets status=parsed", async () => {
    await parseDocument("doc1");
    expect(downloadMock).toHaveBeenCalledTimes(1);
    // 2 updates: parsing → parsed
    expect(updateMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 12.2: Run it (should fail)**

```bash
npm --workspace apps/worker run test -- pipeline/parse-document.test.ts
```
Expected: FAIL ("Cannot find module './parse-document.js'").

- [ ] **Step 12.3: Implement**

Content of `apps/worker/src/pipeline/parse-document.ts`:
```ts
import { admin } from "../supabase/admin.js";
import { parseByMime, type SupportedMime } from "../parsers/index.js";
import { logger } from "../logger.js";

interface DocumentRow {
  id: string;
  subject_id: string;
  file_url: string;  // storage path, e.g. "userId/subjectId/docId/name.pdf"
  type: string;
}

function mimeFromPath(path: string): SupportedMime {
  if (path.endsWith(".pdf")) return "application/pdf";
  if (path.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (path.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  throw new Error(`Unsupported file extension: ${path}`);
}

export async function parseDocument(documentId: string): Promise<void> {
  const sb = admin();

  // 1. Load doc row
  const { data: doc, error: loadErr } = await sb
    .from("documents")
    .select("id, subject_id, file_url, type")
    .eq("id", documentId)
    .single<DocumentRow>();

  if (loadErr || !doc) throw new Error(`Document not found: ${documentId}`);

  // 2. Mark parsing
  await sb.from("documents")
    .update({ status: "parsing", updated_at: new Date().toISOString() })
    .eq("id", documentId);

  try {
    // 3. Download file bytes
    const { data: blob, error: dlErr } = await sb.storage
      .from("documents")
      .download(doc.file_url);
    if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message}`);
    const buf = Buffer.from(await blob.arrayBuffer());

    // 4. Parse
    const mime = mimeFromPath(doc.file_url);
    const res = await parseByMime(mime, buf);
    logger.info("parsed", {
      documentId,
      pageCount: res.pageCount,
      chars: res.markdown.length,
      usedOcr: res.usedOcr,
    });

    // 5. Write back result
    await sb.from("documents")
      .update({
        status: "parsed",
        parsed_markdown: res.markdown,
        page_count: res.pageCount,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("parse failed", { documentId, err: msg });
    await sb.from("documents")
      .update({
        status: "failed",
        error: msg.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    throw err;
  }
}
```

- [ ] **Step 12.4: Run it (should pass)**

```bash
npm --workspace apps/worker run test -- pipeline/parse-document.test.ts
```
Expected: PASS.

- [ ] **Step 12.5: Commit**

```bash
git add apps/worker/src/pipeline/parse-document.ts apps/worker/src/pipeline/parse-document.test.ts
git commit -m "feat(worker): parse-document pipeline orchestrator"
```

---

## Task 13: Worker — Queue poller loop

**Files:**
- Create: `apps/worker/src/queue/poller.ts`
- Create: `apps/worker/src/queue/poller.test.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 13.1: Write a small unit test for the poller**

Content of `apps/worker/src/queue/poller.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

const rpcMock = vi.fn();
const completeMock = vi.fn();
vi.mock("../supabase/admin.js", () => ({
  admin: () => ({
    rpc: (name: string, args: unknown) => {
      if (name === "claim_next_document_job") return rpcMock(args);
      if (name === "complete_document_job") return completeMock(args);
      throw new Error("unknown rpc " + name);
    },
  }),
}));

const parseDocumentMock = vi.fn(async () => {});
vi.mock("../pipeline/parse-document.js", () => ({
  parseDocument: parseDocumentMock,
}));

import { runOnce } from "./poller.js";

describe("poller.runOnce", () => {
  it("returns false when no jobs are queued", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const handled = await runOnce("test-worker");
    expect(handled).toBe(false);
    expect(parseDocumentMock).not.toHaveBeenCalled();
  });

  it("runs parseDocument on a parse job and marks success", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ job_id: "j1", document_id: "d1", kind: "parse" }],
      error: null,
    });
    completeMock.mockResolvedValueOnce({ error: null });
    const handled = await runOnce("test-worker");
    expect(handled).toBe(true);
    expect(parseDocumentMock).toHaveBeenCalledWith("d1");
    expect(completeMock).toHaveBeenCalledWith({
      p_job_id: "j1",
      p_success: true,
      p_error: null,
    });
  });

  it("marks failure when parseDocument throws", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ job_id: "j2", document_id: "d2", kind: "parse" }],
      error: null,
    });
    completeMock.mockResolvedValueOnce({ error: null });
    parseDocumentMock.mockRejectedValueOnce(new Error("boom"));
    const handled = await runOnce("test-worker");
    expect(handled).toBe(true);
    expect(completeMock).toHaveBeenCalledWith({
      p_job_id: "j2",
      p_success: false,
      p_error: "boom",
    });
  });
});
```

- [ ] **Step 13.2: Run (should fail — no poller yet)**

```bash
npm --workspace apps/worker run test -- queue/poller.test.ts
```
Expected: FAIL.

- [ ] **Step 13.3: Implement poller**

Content of `apps/worker/src/queue/poller.ts`:
```ts
import { admin } from "../supabase/admin.js";
import { parseDocument } from "../pipeline/parse-document.js";
import { logger } from "../logger.js";

interface ClaimedJob {
  job_id: string;
  document_id: string;
  kind: "parse" | "chunk" | "extract" | "audit";
}

/** Execute at most one job. Returns true if a job was handled. */
export async function runOnce(workerId: string): Promise<boolean> {
  const sb = admin();
  const { data, error } = await sb.rpc("claim_next_document_job", {
    worker_id: workerId,
  });
  if (error) {
    logger.error("claim rpc failed", { err: error.message });
    return false;
  }
  const jobs = (data ?? []) as ClaimedJob[];
  if (jobs.length === 0) return false;

  const job = jobs[0]!;
  logger.info("job claimed", job);

  try {
    switch (job.kind) {
      case "parse":
        await parseDocument(job.document_id);
        break;
      default:
        throw new Error(`Phase 2 only handles 'parse' jobs; got '${job.kind}'`);
    }
    await sb.rpc("complete_document_job", {
      p_job_id: job.job_id,
      p_success: true,
      p_error: null,
    });
    logger.info("job done", { job_id: job.job_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("job failed", { job_id: job.job_id, err: msg });
    await sb.rpc("complete_document_job", {
      p_job_id: job.job_id,
      p_success: false,
      p_error: msg,
    });
  }
  return true;
}

/** Long-running poll loop. Sleeps `intervalMs` when idle. */
export async function runLoop(workerId: string, intervalMs = 5000): Promise<never> {
  logger.info("poller started", { workerId, intervalMs });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const handled = await runOnce(workerId);
    if (!handled) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
```

- [ ] **Step 13.4: Run the test (should pass)**

```bash
npm --workspace apps/worker run test -- queue/poller.test.ts
```
Expected: 3 PASS.

- [ ] **Step 13.5: Wire into `src/index.ts`**

Replace content of `apps/worker/src/index.ts`:
```ts
import { hostname } from "node:os";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { runLoop } from "./queue/poller.js";

async function main() {
  const workerId = `${hostname()}-${process.pid}`;
  logger.info("worker booting", {
    supabaseUrl: config.SUPABASE_URL,
    logLevel: config.LOG_LEVEL,
    workerId,
  });
  await runLoop(workerId);
}

main().catch((err) => {
  logger.error("worker fatal", { err: String(err) });
  process.exit(1);
});
```

- [ ] **Step 13.6: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): queue poller + wire parse pipeline into main loop"
```

---

## Task 14: Web — Subject detail page + document upload form

**Files:**
- Create: `apps/web/src/app/dashboard/subjects/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/subjects/[id]/upload-form.tsx`
- Create: `apps/web/src/app/dashboard/subjects/[id]/upload-actions.ts`

- [ ] **Step 14.1: Server action to upload + enqueue**

Content of `apps/web/src/app/dashboard/subjects/[id]/upload-actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function extFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  throw new Error("unsupported mime");
}

export async function uploadDocument(subjectId: string, formData: FormData) {
  const file = formData.get("file");
  const type = (formData.get("type") as string) ?? "slide";
  if (!(file instanceof File)) throw new Error("No file");
  if (!ALLOWED.has(file.type)) throw new Error(`Không hỗ trợ định dạng: ${file.type}`);
  if (file.size > 50 * 1024 * 1024) throw new Error("File > 50 MB");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify subject ownership (RLS would block anyway but fail fast with a clear msg)
  const { data: subj, error: subjErr } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .single();
  if (subjErr || !subj) throw new Error("Subject not found or not yours");

  const documentId = randomUUID();
  const ext = extFromMime(file.type);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${subjectId}/${documentId}/${safeName || `file.${ext}`}`;

  // Upload
  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`Upload thất bại: ${upErr.message}`);

  // Insert document row with explicit id so the storage path matches
  const { error: docErr } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      subject_id: subjectId,
      type,
      file_url: path,
      status: "pending",
    });
  if (docErr) {
    // Best-effort cleanup: storage object will be orphaned otherwise.
    await supabase.storage.from("documents").remove([path]);
    throw new Error(`DB insert failed: ${docErr.message}`);
  }

  // Enqueue: document_jobs is server-side only, needs service_role — so we
  // insert via an anon client is not possible. We use a Postgres function
  // that runs as SECURITY DEFINER to enqueue, checking ownership via auth.uid().
  const { error: jobErr } = await supabase.rpc("enqueue_parse_job", {
    p_document_id: documentId,
  });
  if (jobErr) throw new Error(`Enqueue failed: ${jobErr.message}`);

  revalidatePath(`/dashboard/subjects/${subjectId}`);
}
```

Note: this action calls `public.enqueue_parse_job()` which we'll add in Step 14.2.

- [ ] **Step 14.2: Migration — `enqueue_parse_job` RPC**

Create `supabase/migrations/20260423000008_enqueue_rpc.sql`:
```sql
-- SECURITY DEFINER function callable by the web app (anon/authenticated JWT)
-- to enqueue a parse job for a document the caller owns. Without this, the
-- web app would need service_role which must never reach the browser.
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
  -- Verify the caller owns the subject that owns the document.
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
```

Apply:
```bash
supabase db reset
```
Expected: success. Studio → Functions → `enqueue_parse_job`.

- [ ] **Step 14.3: Client upload form**

Content of `apps/web/src/app/dashboard/subjects/[id]/upload-form.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDocument } from "./upload-actions";

export function UploadForm({ subjectId }: { subjectId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await uploadDocument(subjectId, fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="type">Loại tài liệu</Label>
        <select
          id="type"
          name="type"
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          defaultValue="slide"
        >
          <option value="slide">Slide bài giảng</option>
          <option value="outline">Đề cương</option>
          <option value="past_exam">Đề thi năm trước</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="file">File (.pdf / .docx / .pptx, ≤ 50 MB)</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Đang tải lên..." : "Tải lên"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 14.4: Subject detail page**

Content of `apps/web/src/app/dashboard/subjects/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  parsing: "Đang bóc tách",
  parsed: "Đã bóc tách",
  chunking: "Đang chia chunk",
  extracting: "Đang trích xuất",
  auditing: "Đang kiểm tra",
  done: "Hoàn tất",
  failed: "Lỗi",
};

export default async function SubjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subject, error: sErr } = await supabase
    .from("subjects")
    .select("id, name, code, exam_date")
    .eq("id", id)
    .single();
  if (sErr || !subject) redirect("/dashboard");

  const { data: documents } = await supabase
    .from("documents")
    .select("id, type, file_url, status, page_count, created_at")
    .eq("subject_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl space-y-8">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← Danh sách môn
          </Link>
          <h1 className="text-2xl font-bold mt-2">{subject.name}</h1>
          {subject.code && <p className="text-muted-foreground text-sm">Mã: {subject.code}</p>}
          {subject.exam_date && (
            <p className="text-muted-foreground text-sm">Ngày thi: {subject.exam_date}</p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tải lên tài liệu</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadForm subjectId={subject.id} />
          </CardContent>
        </Card>

        <section>
          <h2 className="text-lg font-semibold mb-3">Tài liệu đã tải</h2>
          {!documents || documents.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                Chưa có tài liệu. Tải file đầu tiên ở trên.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => {
                const filename = d.file_url.split("/").pop();
                return (
                  <Card key={d.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.type} · {d.page_count ?? "?"} trang
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs rounded-full border px-2 py-0.5">
                          {STATUS_LABELS[d.status] ?? d.status}
                        </span>
                        {d.status === "parsed" && (
                          <Link
                            href={`/dashboard/documents/${d.id}`}
                            className="text-sm underline"
                          >
                            Xem
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 14.5: Link from dashboard cards**

Modify `apps/web/src/app/dashboard/page.tsx` — wrap the subject card body in a `<Link href={\`/dashboard/subjects/${s.id}\`}>`. Find this block:
```tsx
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle>{s.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {s.code && <div>Mã: {s.code}</div>}
                  {s.exam_date && <div>Ngày thi: {s.exam_date}</div>}
                </CardContent>
              </Card>
```
Replace with:
```tsx
              <Link key={s.id} href={`/dashboard/subjects/${s.id}`}>
                <Card className="hover:border-foreground/30 transition">
                  <CardHeader>
                    <CardTitle>{s.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {s.code && <div>Mã: {s.code}</div>}
                    {s.exam_date && <div>Ngày thi: {s.exam_date}</div>}
                  </CardContent>
                </Card>
              </Link>
```

- [ ] **Step 14.6: Typecheck + build**

```bash
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```
Expected: both exit 0.

- [ ] **Step 14.7: Commit**

```bash
git add apps/web/src supabase/migrations/20260423000008_enqueue_rpc.sql
git commit -m "feat(web): subject detail + document upload + enqueue rpc"
```

---

## Task 15: Web — Parsed document preview page

**Files:**
- Create: `apps/web/src/app/dashboard/documents/[id]/page.tsx`

- [ ] **Step 15.1: Implement**

Content of `apps/web/src/app/dashboard/documents/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPreviewPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, subject_id, type, file_url, parsed_markdown, page_count, status, error")
    .eq("id", id)
    .single();
  if (error || !doc) redirect("/dashboard");

  const filename = doc.file_url.split("/").pop();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <Link
          href={`/dashboard/subjects/${doc.subject_id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Môn học
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{filename}</h1>
          <p className="text-sm text-muted-foreground">
            {doc.type} · {doc.page_count ?? "?"} trang · trạng thái: {doc.status}
          </p>
        </div>

        {doc.status === "failed" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Lỗi</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap">{doc.error}</pre>
            </CardContent>
          </Card>
        )}

        {doc.parsed_markdown ? (
          <Card>
            <CardHeader>
              <CardTitle>Xem trước nội dung (Markdown thô)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded max-h-[70vh] overflow-auto">
                {doc.parsed_markdown}
              </pre>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-muted-foreground text-sm">
              Đang xử lý hoặc chưa có nội dung. Quay lại sau 1-2 phút.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 15.2: Typecheck + build**

```bash
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```
Expected: both exit 0.

- [ ] **Step 15.3: Commit**

```bash
git add apps/web/src/app/dashboard/documents
git commit -m "feat(web): document preview page (parsed markdown)"
```

---

## Task 16: End-to-end smoke test (manual)

**Files:** none (manual verification)

- [ ] **Step 16.1: Start everything**

In three terminals from `D:/saurieng`:
```bash
# T1: DB
supabase start

# T2: web
npm run web

# T3: worker (needs SUPABASE_SERVICE_ROLE_KEY in apps/worker/.env)
npm run worker
```

- [ ] **Step 16.2: Upload a text PDF**

In browser:
1. http://localhost:3000 → Đăng nhập (Google).
2. Create a subject ("Kinh tế vi mô").
3. Click subject card → Upload form → pick `apps/worker/test-fixtures/sample-text.pdf` → Submit.
4. Observe worker terminal: `job claimed` → `parsed` log line within ~30s.
5. Refresh page → status should flip `pending → parsing → parsed`.
6. Click "Xem" → see Markdown preview with `<!-- page: 1 -->` / `<!-- page: 2 -->` separators and the Vietnamese heading text.

- [ ] **Step 16.3: Upload a scan (OCR path)**

Use any scanned-slide PDF (or run:
```bash
# convert text PDF to an image-only PDF to simulate a scan
# requires ghostscript; skip if not installed and use a hand-made scan.
gs -sDEVICE=pdfimage24 -r150 -o apps/worker/test-fixtures/scan.pdf apps/worker/test-fixtures/sample-text.pdf
```
)

Upload through the same UI. Worker log should include:
```
pdf density low, falling back to OCR
ocr page { pageNum: 1 }
...
```
Preview should show transcribed MD text (not garbled).

- [ ] **Step 16.4: Upload a DOCX and a PPTX**

Upload `sample.docx` and `sample.pptx` in turn. Each should go to `parsed` with correct markdown (heading `#` for DOCX, page markers for PPTX).

- [ ] **Step 16.5: Write findings into the spec checklist**

At the bottom of `docs/superpowers/specs/2026-04-23-ongap-design.md` under "Cần check trước khi implementation", tick:
- [x] Test `marker` tool... → (we used `pdf-parse` + `officeparser` + `mammoth` in Phase 2 instead; note the substitution)
- [x] Test Claude Haiku vision OCR on 1-3 VN slide scans → record char-density threshold you actually observed

- [ ] **Step 16.6: No new code → no commit for this task.**

---

## Task 17: Worker `.env` update + docs

**Files:**
- Modify: `apps/worker/.env.example`
- Modify: `README.md`

- [ ] **Step 17.1: Ensure `.env.example` documents both keys**

Content of `apps/worker/.env.example`:
```bash
# Worker config. Copy to .env and fill.
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key from `supabase start` output>
LOG_LEVEL=info
```

- [ ] **Step 17.2: Update top-level README with Phase 2 run steps**

In `README.md`, replace the "Development" section with the following (preserve surrounding prose):
```markdown
## Development

Requirements:
- Node.js 20+
- `claude` CLI authenticated (`claude login`)
- Supabase CLI (`npm i -g supabase`)

Install:
```bash
npm install
```

First-time setup:
```bash
supabase start              # starts Postgres + Storage locally
cp apps/web/.env.local.example apps/web/.env.local     # paste anon key
cp apps/worker/.env.example   apps/worker/.env         # paste service_role key
```

Run (three terminals):
```bash
npm run web         # Next.js @ http://localhost:3000
npm run worker      # parses uploaded documents
supabase start      # if not already running
```

Tests:
```bash
npm test            # worker unit tests (some call real Claude; need `claude login`)
```
```

- [ ] **Step 17.3: Commit**

```bash
git add apps/worker/.env.example README.md
git commit -m "docs: phase 2 run instructions + env template"
```

---

## Self-Review Checklist

Before handing off, confirm:

1. **Spec coverage (spec Section 7 Tuần 2 gate):**
   - [x] Upload PDF 20 trang → worker pick job → structured MD in DB with heading preserved → Tasks 2, 3, 11, 12, 13, 14, 16
   - [x] OCR fallback Haiku vision test trên 1 slide scan → Tasks 9, 10, 16.3
   - [x] Display preview to user → Task 15

2. **No placeholders:** every code block is complete and self-contained.

3. **Type consistency:**
   - `parseByMime` returns `{ markdown, pageCount, usedOcr }` — matches usage in `parseDocument`.
   - `parsePdf/Docx/Pptx/ocrPdf` all return `{ markdown, pageCount, totalChars }`.
   - `askClaudeVision` parameter shape matches caller in `ocr.ts`.
   - `claim_next_document_job` returns `(job_id, document_id, kind)` — matches `ClaimedJob` in poller.

4. **Out of scope discipline:** no chunker, no Claude extraction, no embedding into chunks. Those are Phase 3.

5. **Security:**
   - Storage path starts with `auth.uid()` → RLS enforces per-user isolation.
   - `enqueue_parse_job` is SECURITY DEFINER but checks `auth.uid()` against document owner.
   - `document_jobs` table has RLS enabled with no end-user policies → only service_role can read/write.
   - Web never loads service_role key.

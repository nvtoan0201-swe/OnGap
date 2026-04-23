# ÔnGấp — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the ÔnGấp foundation — Next.js 15 + Supabase + Node worker + Claude Code SDK PoC + local embedding PoC — so that a user can log in with Google, create a subject, and the worker can talk to Claude and produce a Vietnamese embedding vector.

**Architecture:** npm-workspaces monorepo with two apps — `apps/web` (Next.js 15 PWA-ready, Supabase Auth + Tailwind + shadcn/ui) and `apps/worker` (Node 20+ daemon that reads Supabase jobs, calls Claude via `@anthropic-ai/claude-agent-sdk`, and embeds locally via `@xenova/transformers`). Database schema (11 tables + pgvector) lives in `supabase/migrations/`.

**Tech Stack:** Next.js 15 (App Router, TypeScript strict), Tailwind CSS 4, shadcn/ui, Supabase (Postgres + pgvector + Auth + Storage), Node.js 20+, `@anthropic-ai/claude-agent-sdk`, `@xenova/transformers`, Zod, Vitest.

**Prerequisite:** you have a Claude Pro/Max subscription with `claude` CLI authenticated on this machine (verify by running `claude --version` — confirmed working: 2.1.118).

---

## File Structure (locked)

```
D:/saurieng/
├── .git/
├── .gitignore
├── .editorconfig
├── .nvmrc
├── README.md
├── package.json                               # npm workspaces root
├── package-lock.json
├── tsconfig.base.json
├── docs/
│   └── superpowers/
│       ├── specs/2026-04-23-ongap-design.md   # already exists
│       └── plans/2026-04-23-phase1-foundation.md  # THIS FILE
├── apps/
│   ├── web/                                   # Next.js 15 app
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── components.json                    # shadcn
│   │   ├── .env.local.example
│   │   ├── middleware.ts
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx                   # landing
│   │       │   ├── globals.css
│   │       │   ├── login/page.tsx
│   │       │   ├── auth/callback/route.ts
│   │       │   ├── dashboard/page.tsx
│   │       │   └── dashboard/subjects/new/page.tsx
│   │       ├── components/
│   │       │   ├── ui/                        # shadcn button/card/input
│   │       │   └── site-header.tsx
│   │       └── lib/
│   │           ├── supabase/
│   │           │   ├── client.ts
│   │           │   ├── server.ts
│   │           │   └── middleware.ts
│   │           └── utils.ts
│   └── worker/                                # Node.js worker
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── .env.example
│       └── src/
│           ├── index.ts                       # entrypoint (CLI ping)
│           ├── config.ts                      # env validation (Zod)
│           ├── logger.ts
│           ├── claude/
│           │   ├── client.ts                  # SDK wrapper
│           │   └── client.test.ts
│           └── embedding/
│               ├── embedder.ts                # Transformers.js wrapper
│               └── embedder.test.ts
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/
│       ├── 20260423000001_init_extensions.sql
│       ├── 20260423000002_core_tables.sql
│       ├── 20260423000003_content_tables.sql
│       ├── 20260423000004_study_tables.sql
│       └── 20260423000005_rls_policies.sql
└── scripts/
    └── check-domains.mjs                      # DNS-based availability probe
```

**Separation of concerns:** `apps/web` only talks to Supabase (no Claude). `apps/worker` only talks to Supabase + Claude + local ML model (no browser). Keeps the SDK (which needs a logged-in `claude` CLI) off the edge/serverless boundary.

---

## Task 1: Repo init + workspace layout

**Files:**
- Create: `D:/saurieng/.gitignore`
- Create: `D:/saurieng/.editorconfig`
- Create: `D:/saurieng/.nvmrc`
- Create: `D:/saurieng/README.md`
- Create: `D:/saurieng/package.json`
- Create: `D:/saurieng/tsconfig.base.json`

- [ ] **Step 1.1: Initialize git repo**

Run from `D:/saurieng`:
```bash
git init
git branch -M main
```
Expected: `Initialized empty Git repository` (no error about existing repo).

- [ ] **Step 1.2: Create `.gitignore`**

Content:
```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Next.js
.next/
out/
build/
dist/

# Env
.env
.env.local
.env.*.local
!.env.example
!.env.local.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS
.DS_Store
Thumbs.db

# Editors
.vscode/
.idea/

# Supabase
supabase/.branches
supabase/.temp

# Vitest
coverage/

# Models (Transformers.js caches large files)
.cache/
**/node_modules/@xenova/transformers/.cache/
```

- [ ] **Step 1.3: Create `.editorconfig`**

Content:
```editorconfig
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 1.4: Create `.nvmrc`**

Content:
```
20
```

- [ ] **Step 1.5: Create root `package.json` (npm workspaces)**

Content:
```json
{
  "name": "ongap",
  "version": "0.0.1",
  "private": true,
  "description": "ÔnGấp — AI exam cramming for Vietnamese students",
  "workspaces": [
    "apps/*"
  ],
  "scripts": {
    "web": "npm --workspace apps/web run dev",
    "worker": "npm --workspace apps/worker run dev",
    "test": "npm --workspace apps/worker run test",
    "typecheck": "npm --workspace apps/web run typecheck && npm --workspace apps/worker run typecheck",
    "check-domains": "node scripts/check-domains.mjs"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 1.6: Create `tsconfig.base.json`**

Content:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 1.7: Create `README.md`**

Content:
```markdown
# ÔnGấp

App AI giúp sinh viên Việt Nam ôn thi cuối kỳ trong 3-7 ngày. Upload slide → AI trích xuất kiến thức (không tóm tắt) → flashcard verbatim + quiz adaptive + dự đoán đề.

## Development

Requirements:
- Node.js 20+
- `claude` CLI authenticated (`claude login`)
- Supabase CLI (`npm i -g supabase`)

Install:
```bash
npm install
```

Run web:
```bash
npm run web
```

Run worker:
```bash
npm run worker
```

Run tests:
```bash
npm test
```

Check domain availability:
```bash
npm run check-domains
```

See `docs/superpowers/specs/2026-04-23-ongap-design.md` for architecture.
```

- [ ] **Step 1.8: First commit**

```bash
git add .gitignore .editorconfig .nvmrc package.json tsconfig.base.json README.md
git commit -m "chore: initialize monorepo skeleton"
```

---

## Task 2: Domain availability probe

**Files:**
- Create: `scripts/check-domains.mjs`

- [ ] **Step 2.1: Write the probe script**

Content of `scripts/check-domains.mjs`:
```js
#!/usr/bin/env node
// Rough availability probe — resolves DNS for candidate domains.
// Does NOT replace a registrar whois check, but gives a quick signal:
// domains that resolve are almost certainly taken.

import { promises as dns } from 'node:dns';

const candidates = [
  'ongap.com',
  'ongap.vn',
  'ongap.app',
  'ongap.io',
  'ongap.edu.vn',
];

async function probe(domain) {
  try {
    const records = await dns.resolve(domain);
    return { domain, status: 'RESOLVES (likely taken)', records };
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { domain, status: 'NO DNS RECORD (possibly available — verify on registrar)' };
    }
    return { domain, status: `ERROR: ${err.code}` };
  }
}

const results = await Promise.all(candidates.map(probe));
console.log('\nDomain availability probe (DNS only — confirm via registrar):\n');
for (const r of results) {
  console.log(`  ${r.domain.padEnd(20)} → ${r.status}`);
}
console.log('\nNext step: verify each "possibly available" on Namecheap/Tenten/PA Vietnam.\n');
```

- [ ] **Step 2.2: Run the probe**

Run: `node scripts/check-domains.mjs`
Expected: output listing 5 domains with status. Write results into the spec's "Cần check trước khi implementation" checklist.

- [ ] **Step 2.3: Manually verify top candidate on registrar**

Open https://www.namecheap.com and https://tenten.vn — search for the top candidate from step 2.2. Record the result (available / taken, price) in a comment at the bottom of `scripts/check-domains.mjs` as `// RESULT 2026-04-23: ...`.

- [ ] **Step 2.4: Commit**

```bash
git add scripts/check-domains.mjs
git commit -m "chore: add domain availability probe"
```

---

## Task 3: Scaffold Next.js 15 web app

**Files:**
- Create: `apps/web/` (via `create-next-app`)
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`

- [ ] **Step 3.1: Generate the Next.js app**

Run from `D:/saurieng`:
```bash
npx create-next-app@latest apps/web \
  --typescript --tailwind --eslint \
  --app --src-dir --turbopack \
  --import-alias "@/*" \
  --use-npm --no-git
```

Answer any remaining prompts as default. Expected: `apps/web` directory with `src/app/page.tsx` etc.

- [ ] **Step 3.2: Extend `apps/web/tsconfig.json` to inherit base**

Modify `apps/web/tsconfig.json` so its `compilerOptions` block merges base settings. Replace existing file with:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3.3: Add a `typecheck` script**

Edit `apps/web/package.json` `scripts` section, add:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3.4: Verify it builds**

Run:
```bash
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```
Expected: both exit 0.

- [ ] **Step 3.5: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -m "feat(web): scaffold Next.js 15 app with TS + Tailwind"
```

---

## Task 4: shadcn/ui setup

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 4.1: Init shadcn/ui**

Run from `apps/web`:
```bash
cd apps/web && npx shadcn@latest init --defaults --yes
```

Expected: creates `components.json`, `src/lib/utils.ts`, updates `tailwind.config.ts` and `src/app/globals.css` with CSS variables.

- [ ] **Step 4.2: Add base components we'll need in Task 5+**

From `apps/web`:
```bash
npx shadcn@latest add button card input label form
```

Expected: creates `src/components/ui/{button,card,input,label,form}.tsx`.

- [ ] **Step 4.3: Verify typecheck still passes**

Run from repo root:
```bash
npm --workspace apps/web run typecheck
```
Expected: exit 0.

- [ ] **Step 4.4: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -m "feat(web): add shadcn/ui base components"
```

---

## Task 5: Landing page

**Files:**
- Create: `apps/web/src/components/site-header.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 5.1: Create site header**

Content of `apps/web/src/components/site-header.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="font-bold text-lg">
          ÔnGấp
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Đăng nhập</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">Thử miễn phí</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 5.2: Replace landing page with product hero**

Replace entire content of `apps/web/src/app/page.tsx` with:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Ôn thi cuối kỳ trong 3 ngày
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload slide bài giảng. AI <strong>trích xuất toàn bộ kiến thức</strong>
            &nbsp;(không tóm tắt mất nội dung) thành flashcard, quiz, và dự đoán đề.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">Bắt đầu miễn phí</Link>
            </Button>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Trích xuất, không tóm tắt",
              body: "Multi-pass Claude AI giữ lại 100% định nghĩa, công thức, ví dụ — cite đúng trang nguồn.",
            },
            {
              title: "Flashcard verbatim",
              body: "Spaced repetition kiểu Tinder. Mặt sau là nguyên văn từ slide, không paraphrase sai.",
            },
            {
              title: "Dự đoán đề",
              body: "Match đề cương + đề thi cũ crowdsource để dự đoán câu hỏi có khả năng cao.",
            },
          ].map((f) => (
            <Card key={f.title}>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © 2026 ÔnGấp
      </footer>
    </div>
  );
}
```

- [ ] **Step 5.3: Set Vietnamese-friendly metadata**

Replace content of `apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ÔnGấp — Ôn thi cuối kỳ trong 3 ngày",
  description:
    "App AI giúp sinh viên Việt Nam ôn thi cuối kỳ. Upload slide, AI trích xuất kiến thức thành flashcard, quiz, và dự đoán đề.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5.4: Verify the page renders**

Run from repo root:
```bash
npm --workspace apps/web run dev
```
Open http://localhost:3000. Expected: hero "Ôn thi cuối kỳ trong 3 ngày", 3 feature cards, header with login button. Kill server (Ctrl+C).

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): landing page with hero + features"
```

---

## Task 6: Supabase local dev environment

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/seed.sql`
- Create: `apps/web/.env.local.example`

- [ ] **Step 6.1: Install Supabase CLI**

Run:
```bash
npm install -g supabase
supabase --version
```
Expected: version string printed (1.x or 2.x).

- [ ] **Step 6.2: Init Supabase config**

Run from `D:/saurieng`:
```bash
supabase init
```
Expected: creates `supabase/config.toml`, `supabase/seed.sql`.

- [ ] **Step 6.3: Start local Supabase stack**

Run:
```bash
supabase start
```
Expected output: "Started supabase local development setup." with URLs:
- API URL: `http://127.0.0.1:54321`
- DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Studio URL: `http://127.0.0.1:54323`
- anon key: `eyJ...`
- service_role key: `eyJ...`

Save all four values to a scratchpad — you'll paste into env files.

- [ ] **Step 6.4: Create `apps/web/.env.local.example`**

Content:
```bash
# Supabase (local dev — from `supabase start` output)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key here>

# Google OAuth (set after Task 10)
# These go into supabase/config.toml [auth.external.google], not here directly.
```

- [ ] **Step 6.5: Create `apps/web/.env.local` from the example**

Copy `.env.local.example` to `.env.local` and paste the real anon key from Step 6.3.

- [ ] **Step 6.6: Commit**

```bash
git add supabase/config.toml supabase/seed.sql apps/web/.env.local.example
git commit -m "chore(supabase): init local dev stack"
```

---

## Task 7: Migration 1 — pgvector + core tables (users, subjects)

**Files:**
- Create: `supabase/migrations/20260423000001_init_extensions.sql`
- Create: `supabase/migrations/20260423000002_core_tables.sql`

- [ ] **Step 7.1: Write extensions migration**

Content of `supabase/migrations/20260423000001_init_extensions.sql`:
```sql
-- Enable pgvector for entry + chunk embeddings (768 dims for multilingual-e5-base)
create extension if not exists vector;

-- UUID helper
create extension if not exists "uuid-ossp";
```

- [ ] **Step 7.2: Write core tables migration**

Content of `supabase/migrations/20260423000002_core_tables.sql`:
```sql
-- Users table: mirror of auth.users with profile fields.
-- Populated via trigger on auth.users insert.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  google_id text,
  university text,
  major text,
  year integer check (year between 1 and 7),
  created_at timestamptz not null default now()
);

-- Subjects: one per exam the user is cramming for.
create table public.subjects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  code text,
  exam_date date,
  created_at timestamptz not null default now()
);

create index idx_subjects_user on public.subjects(user_id);

-- Auto-populate public.users on auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, google_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'sub'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 7.3: Apply migrations to local DB**

Run:
```bash
supabase db reset
```
Expected: "Resetting local database..." then "Finished supabase db reset." without SQL errors.

- [ ] **Step 7.4: Verify tables exist**

Run:
```bash
supabase db diff --use-migra --schema public
```
Expected: no diff (migrations match schema). Also connect Studio at http://127.0.0.1:54323 → Table Editor → confirm `users` and `subjects` visible.

- [ ] **Step 7.5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): pgvector + users + subjects tables"
```

---

## Task 8: Migration 2 — content tables (documents, chunks, entries, coverage_audits, summaries)

**Files:**
- Create: `supabase/migrations/20260423000003_content_tables.sql`

- [ ] **Step 8.1: Write migration**

Content of `supabase/migrations/20260423000003_content_tables.sql`:
```sql
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
```

- [ ] **Step 8.2: Apply and verify**

Run:
```bash
supabase db reset
```
Expected: no errors. Confirm in Studio all 5 new tables exist.

- [ ] **Step 8.3: Commit**

```bash
git add supabase/migrations/20260423000003_content_tables.sql
git commit -m "feat(db): documents + chunks + entries + audits + summaries"
```

---

## Task 9: Migration 3 — study tables (flashcards, quizzes, predictions, past exams, gap reports, subscriptions)

**Files:**
- Create: `supabase/migrations/20260423000004_study_tables.sql`

- [ ] **Step 9.1: Write migration**

Content of `supabase/migrations/20260423000004_study_tables.sql`:
```sql
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
```

- [ ] **Step 9.2: Apply and verify**

Run:
```bash
supabase db reset
```
Expected: no errors. In Studio confirm `flashcards`, `flashcard_reviews`, `quizzes`, `quiz_attempts`, `exam_predictions`, `past_exams`, `gap_reports`, `subscriptions` exist.

- [ ] **Step 9.3: Commit**

```bash
git add supabase/migrations/20260423000004_study_tables.sql
git commit -m "feat(db): flashcards + quizzes + predictions + subscriptions"
```

---

## Task 10: Migration 4 — Row Level Security policies

**Files:**
- Create: `supabase/migrations/20260423000005_rls_policies.sql`

- [ ] **Step 10.1: Write RLS migration**

Content of `supabase/migrations/20260423000005_rls_policies.sql`:
```sql
-- Every user-owned table enables RLS. Worker uses service_role which bypasses RLS.

alter table public.users           enable row level security;
alter table public.subjects        enable row level security;
alter table public.documents       enable row level security;
alter table public.chunks          enable row level security;
alter table public.entries         enable row level security;
alter table public.coverage_audits enable row level security;
alter table public.summaries       enable row level security;
alter table public.flashcards      enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.quizzes         enable row level security;
alter table public.quiz_attempts   enable row level security;
alter table public.exam_predictions enable row level security;
alter table public.past_exams      enable row level security;
alter table public.gap_reports     enable row level security;
alter table public.subscriptions   enable row level security;

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
```

- [ ] **Step 10.2: Apply**

```bash
supabase db reset
```
Expected: no errors.

- [ ] **Step 10.3: Commit**

```bash
git add supabase/migrations/20260423000005_rls_policies.sql
git commit -m "feat(db): row level security policies"
```

---

## Task 11: Google OAuth wiring in local Supabase

**Files:**
- Modify: `supabase/config.toml`
- Modify: `apps/web/.env.local.example` (append note)

- [ ] **Step 11.1: Create Google OAuth credentials**

Manual step:
1. Open https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → "Web application"
3. Authorized redirect URIs: `http://127.0.0.1:54321/auth/v1/callback`
4. Record Client ID and Client Secret.

- [ ] **Step 11.2: Edit `supabase/config.toml`**

Find the `[auth.external.google]` block (or add it) and set:
```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
skip_nonce_check = false
```

Also ensure site_url is set for the web app:
```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
```

- [ ] **Step 11.3: Add the env vars to the local Supabase shell**

Create `D:/saurieng/.env` (NOT committed — already in .gitignore) with:
```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<from step 11.1>
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<from step 11.1>
```

- [ ] **Step 11.4: Restart Supabase picking up the config**

Run:
```bash
supabase stop
supabase start
```
Expected: no error about google provider.

- [ ] **Step 11.5: Commit (only the config.toml diff)**

```bash
git add supabase/config.toml
git commit -m "feat(auth): enable Google OAuth in local Supabase"
```

---

## Task 12: Next.js Supabase client + middleware

**Files:**
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/middleware.ts`
- Create: `apps/web/middleware.ts`
- Modify: `apps/web/package.json` (add `@supabase/ssr`, `@supabase/supabase-js`)

- [ ] **Step 12.1: Install Supabase libs in the web workspace**

Run from repo root:
```bash
npm --workspace apps/web install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 12.2: Create the browser client**

Content of `apps/web/src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 12.3: Create the server client**

Content of `apps/web/src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies — safe to ignore if middleware refreshes.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 12.4: Create the session-refresh middleware helper**

Content of `apps/web/src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 12.5: Wire up the Next.js middleware**

Content of `apps/web/middleware.ts`:
```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 12.6: Typecheck**

```bash
npm --workspace apps/web run typecheck
```
Expected: exit 0.

- [ ] **Step 12.7: Commit**

```bash
git add apps/web/src/lib/supabase apps/web/middleware.ts apps/web/package.json package-lock.json
git commit -m "feat(web): supabase ssr client + session middleware"
```

---

## Task 13: Login page + OAuth callback route

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/auth/callback/route.ts`

- [ ] **Step 13.1: Create the login page**

Content of `apps/web/src/app/login/page.tsx`:
```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập ÔnGấp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dùng Google để đăng nhập. Chúng tôi chỉ lấy email + tên hiển thị.
          </p>
          <Button className="w-full" onClick={signInWithGoogle}>
            Đăng nhập với Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 13.2: Create the callback route**

Content of `apps/web/src/app/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
```

- [ ] **Step 13.3: Manual test — login works**

Run:
```bash
npm --workspace apps/web run dev
```
Open http://localhost:3000/login, click "Đăng nhập với Google". After consent, should land on /dashboard (which 404s for now — that's expected, next task). Browser devtools Application → Cookies should show Supabase session cookies on `localhost`.

- [ ] **Step 13.4: Commit**

```bash
git add apps/web/src/app/login apps/web/src/app/auth
git commit -m "feat(auth): login page + google oauth callback"
```

---

## Task 14: Dashboard + create-subject page

**Files:**
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/dashboard/subjects/new/page.tsx`
- Create: `apps/web/src/app/dashboard/actions.ts`

- [ ] **Step 14.1: Create dashboard listing subjects**

Content of `apps/web/src/app/dashboard/page.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("id, name, code, exam_date")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Các môn của bạn</h1>
          <Button asChild>
            <Link href="/dashboard/subjects/new">+ Thêm môn</Link>
          </Button>
        </div>

        {subjects && subjects.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="p-8 text-center text-muted-foreground">
              Chưa có môn nào. Bấm "+ Thêm môn" để tạo môn đầu tiên.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subjects?.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle>{s.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {s.code && <div>Mã: {s.code}</div>}
                  {s.exam_date && <div>Ngày thi: {s.exam_date}</div>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 14.2: Create the server action**

Content of `apps/web/src/app/dashboard/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createSubject(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const examDateRaw = String(formData.get("exam_date") ?? "").trim();
  const exam_date = examDateRaw ? examDateRaw : null;

  if (!name) {
    throw new Error("Tên môn là bắt buộc");
  }

  const { error } = await supabase.from("subjects").insert({
    user_id: user.id,
    name,
    code,
    exam_date,
  });

  if (error) throw error;
  redirect("/dashboard");
}
```

- [ ] **Step 14.3: Create the new-subject form page**

Content of `apps/web/src/app/dashboard/subjects/new/page.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/site-header";
import { createSubject } from "@/app/dashboard/actions";

export default function NewSubjectPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Tạo môn học mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createSubject} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tên môn *</Label>
                <Input id="name" name="name" required placeholder="Kinh tế vi mô" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Mã môn (optional)</Label>
                <Input id="code" name="code" placeholder="ECON101" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam_date">Ngày thi (optional)</Label>
                <Input id="exam_date" name="exam_date" type="date" />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Tạo</Button>
                <Button asChild variant="ghost" type="button">
                  <Link href="/dashboard">Hủy</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

- [ ] **Step 14.4: Manual E2E — first user happy path**

With `npm run web` + Supabase running:
1. Open http://localhost:3000 → click "Đăng nhập" → login with Google.
2. Expected redirect to /dashboard showing empty state "Chưa có môn nào".
3. Click "+ Thêm môn" → fill in `Kinh tế vi mô`, `ECON101`, pick a date → submit.
4. Back on /dashboard: card with the subject renders.
5. In Studio: `select * from public.subjects` → row exists, `user_id` = your `auth.users.id`.

If any of the above fails, fix before committing.

- [ ] **Step 14.5: Commit**

```bash
git add apps/web/src/app/dashboard
git commit -m "feat(web): dashboard + create subject flow"
```

---

## Task 15: Worker scaffold

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/vitest.config.ts`
- Create: `apps/worker/.env.example`
- Create: `apps/worker/src/logger.ts`
- Create: `apps/worker/src/config.ts`
- Create: `apps/worker/src/index.ts`

- [ ] **Step 15.1: Create `apps/worker/package.json`**

Content:
```json
{
  "name": "@ongap/worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@supabase/supabase-js": "^2.45.0",
    "@xenova/transformers": "^2.17.2",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Note: if `@anthropic-ai/claude-agent-sdk` at `^0.1.0` fails npm install, fall back to the latest available (`npm view @anthropic-ai/claude-agent-sdk version`). If the package name has changed, the Claude Code docs will point to the current one; pin whatever `npm install <name>@latest` resolves to.

- [ ] **Step 15.2: Install worker deps**

```bash
npm --workspace apps/worker install
```

Expected: installs without error. If `@anthropic-ai/claude-agent-sdk` fails, run `npm view @anthropic-ai/claude-agent-sdk versions --json` to find a valid version and update the `package.json`.

- [ ] **Step 15.3: Create `apps/worker/tsconfig.json`**

Content:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 15.4: Create `apps/worker/vitest.config.ts`**

Content:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 120_000, // embedding model + claude roundtrip can be slow first run
  },
});
```

- [ ] **Step 15.5: Create `apps/worker/.env.example`**

Content:
```bash
# Supabase (worker uses service_role to bypass RLS)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key from `supabase start`>

# Claude Code SDK — no API key needed, uses `claude` CLI auth.
# Ensure `claude login` was run at least once.

LOG_LEVEL=info
```

Copy to `.env` (not committed) and fill in `SUPABASE_SERVICE_ROLE_KEY` from `supabase start` output.

- [ ] **Step 15.6: Create the logger**

Content of `apps/worker/src/logger.ts`:
```ts
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const current: Level = (process.env.LOG_LEVEL as Level) ?? "info";

function log(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (order[level] < order[current]) return;
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => log("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
};
```

- [ ] **Step 15.7: Create config validator**

Content of `apps/worker/src/config.ts`:
```ts
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast at startup with a clear list of missing/invalid fields.
  console.error("Invalid worker config:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
```

- [ ] **Step 15.8: Create entrypoint (ping only for Phase 1)**

Content of `apps/worker/src/index.ts`:
```ts
import { config } from "./config.js";
import { logger } from "./logger.js";

async function main() {
  logger.info("worker booted", {
    supabaseUrl: config.SUPABASE_URL,
    logLevel: config.LOG_LEVEL,
  });
  // Phase 1: just prove boot + env validation. Real job loop lands in Phase 2.
}

main().catch((err) => {
  logger.error("worker fatal", { err: String(err) });
  process.exit(1);
});
```

- [ ] **Step 15.9: Run it**

```bash
npm --workspace apps/worker run dev
```
Expected: JSON log line with `"msg":"worker booted"`. Ctrl+C.

- [ ] **Step 15.10: Commit**

```bash
git add apps/worker package.json package-lock.json
git commit -m "feat(worker): scaffold node worker with config + logger"
```

---

## Task 16: Claude Code SDK PoC (TDD)

**Files:**
- Create: `apps/worker/src/claude/client.ts`
- Create: `apps/worker/src/claude/client.test.ts`

- [ ] **Step 16.1: Write the failing test**

Content of `apps/worker/src/claude/client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { askClaude } from "./client.js";

describe("askClaude", () => {
  it("returns non-empty text from Haiku for a trivial prompt", async () => {
    const out = await askClaude({
      model: "haiku",
      prompt: "Say only the single word: pong",
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out.toLowerCase()).toContain("pong");
  }, 60_000);

  it("returns structured JSON for a schema-prompt via Sonnet", async () => {
    const out = await askClaude({
      model: "sonnet",
      prompt:
        'Respond ONLY with compact JSON: {"animal":"cat","legs":4}. No markdown, no prose.',
    });
    const parsed = JSON.parse(out.trim().replace(/^```json\s*|\s*```$/g, ""));
    expect(parsed).toEqual({ animal: "cat", legs: 4 });
  }, 60_000);
});
```

- [ ] **Step 16.2: Run the test to confirm it fails**

```bash
npm --workspace apps/worker run test
```
Expected: fail with "Cannot find module './client.js'" or similar.

- [ ] **Step 16.3: Implement the client**

Content of `apps/worker/src/claude/client.ts`:
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
 * Uses the authenticated `claude` CLI via Claude Code SDK (no API key).
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
```

NOTE: The exact event shape and property names in `@anthropic-ai/claude-agent-sdk` may differ by version. If the test fails with `event.type` being unexpected, add a `logger.debug("raw event", { event })` line above the branching and inspect one run manually (`npm run test -- --reporter=verbose`). Adjust the message extraction to the SDK's actual contract — the contract is: iterate async, collect text from assistant messages. The schema is stable enough across minor versions that adjusting two property names suffices.

- [ ] **Step 16.4: Run the test until it passes**

```bash
npm --workspace apps/worker run test
```

If it fails because the `claude` CLI isn't authenticated, run `claude login` once, then retry. If it fails because of SDK shape, see the NOTE in step 16.3.

Expected final: both tests PASS.

- [ ] **Step 16.5: Commit**

```bash
git add apps/worker/src/claude
git commit -m "feat(worker): claude code sdk wrapper + tests"
```

---

## Task 17: Transformers.js embedding PoC (TDD)

**Files:**
- Create: `apps/worker/src/embedding/embedder.ts`
- Create: `apps/worker/src/embedding/embedder.test.ts`

- [ ] **Step 17.1: Write the failing test**

Content of `apps/worker/src/embedding/embedder.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { embedText, embedPassages, cosine, initEmbedder } from "./embedder.js";

describe("embedder", () => {
  beforeAll(async () => {
    await initEmbedder();
  }, 120_000);

  it("embeds Vietnamese text into a 768-dim vector", async () => {
    const vec = await embedText("Cầu thị trường là lượng hàng hóa người mua sẵn sàng mua.");
    expect(vec).toHaveLength(768);
    expect(Number.isFinite(vec[0])).toBe(true);
    // e5 models are L2-normalized; magnitude ≈ 1
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeGreaterThan(0.95);
    expect(mag).toBeLessThan(1.05);
  }, 120_000);

  it("gives higher cosine between semantically close VN sentences", async () => {
    const [a, b, c] = await embedPassages([
      "Cầu thị trường phụ thuộc vào giá hàng hóa.",
      "Giá cả ảnh hưởng đến nhu cầu của người tiêu dùng.",
      "Con mèo của tôi thích ăn cá.",
    ]);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  }, 120_000);
});
```

- [ ] **Step 17.2: Run the test to confirm it fails**

```bash
npm --workspace apps/worker run test -- embedder
```
Expected: fail with module-not-found on `./embedder.js`.

- [ ] **Step 17.3: Implement the embedder**

Content of `apps/worker/src/embedding/embedder.ts`:
```ts
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { logger } from "../logger.js";

const MODEL_ID = "Xenova/multilingual-e5-base";
let pipe: FeatureExtractionPipeline | null = null;

/**
 * Warms the pipeline. First call downloads ~280MB and can take 1-3 min.
 * Subsequent calls are fast.
 */
export async function initEmbedder(): Promise<void> {
  if (pipe) return;
  logger.info("loading embedding model", { model: MODEL_ID });
  const started = Date.now();
  pipe = await pipeline("feature-extraction", MODEL_ID);
  logger.info("embedding model loaded", { ms: Date.now() - started });
}

function assertReady(): FeatureExtractionPipeline {
  if (!pipe) {
    throw new Error("Embedder not initialized. Call initEmbedder() first.");
  }
  return pipe;
}

async function embedWithPrefix(prefix: "query" | "passage", text: string): Promise<number[]> {
  const ready = assertReady();
  const output = await ready(`${prefix}: ${text}`, { pooling: "mean", normalize: true });
  // output.data is a Float32Array of length 768
  return Array.from(output.data as Float32Array);
}

export async function embedQuery(text: string): Promise<number[]> {
  return embedWithPrefix("query", text);
}

export async function embedText(text: string): Promise<number[]> {
  return embedWithPrefix("passage", text);
}

export async function embedPassages(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embedText(t));
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("vector length mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

- [ ] **Step 17.4: Run the test until it passes**

```bash
npm --workspace apps/worker run test -- embedder
```

Note: first run downloads ~280MB model weights. Watch for progress logs. Subsequent runs use cache (`.cache/` in node_modules).

Expected: both tests pass. Total time first run 2-3 min; after cache <10s.

- [ ] **Step 17.5: Quick throughput measurement**

Append a throw-away script `apps/worker/src/embedding/bench.ts`:
```ts
import { initEmbedder, embedText } from "./embedder.js";

await initEmbedder();
const sample =
  "Kinh tế vi mô nghiên cứu hành vi của cá nhân, hộ gia đình và doanh nghiệp.";

const N = 30;
const started = Date.now();
for (let i = 0; i < N; i++) {
  await embedText(sample);
}
const ms = Date.now() - started;
console.log(`${N} embeds in ${ms}ms → ${((N / ms) * 1000).toFixed(1)}/sec`);
```

Run once:
```bash
npx tsx apps/worker/src/embedding/bench.ts
```

Expected: ≥8/sec on a modest laptop CPU. Record the result in a comment at top of `embedder.ts` (e.g. `// bench 2026-04-23 i7-11800H: 22 embeds/sec`).

Delete the bench file before commit: `rm apps/worker/src/embedding/bench.ts`.

- [ ] **Step 17.6: Commit**

```bash
git add apps/worker/src/embedding
git commit -m "feat(worker): local embedding via transformers.js"
```

---

## Task 18: End-to-end gate check + Phase 1 summary

**Files:**
- Modify: `README.md` (append "Phase 1 status" section)

- [ ] **Step 18.1: Run the full foundation check**

Checklist, all must pass:

1. `npm --workspace apps/web run typecheck` → exit 0.
2. `npm --workspace apps/web run build` → exit 0.
3. `npm --workspace apps/worker run typecheck` → exit 0.
4. `npm --workspace apps/worker run test` → all pass (Claude + embedder tests).
5. `supabase start` → clean start, Studio shows 15 public tables (users, subjects, documents, chunks, entries, coverage_audits, summaries, flashcards, flashcard_reviews, quizzes, quiz_attempts, exam_predictions, past_exams, gap_reports, subscriptions).
6. Manual login flow from Task 14.4 works end-to-end, row inserted in `public.subjects`.
7. Domain result from Task 2.3 recorded.

Fix anything that fails before continuing.

- [ ] **Step 18.2: Append status to README.md**

Append to `README.md`:
```markdown
## Phase 1 status (2026-04-23)

- [x] Next.js 15 scaffold (`apps/web`)
- [x] shadcn/ui base components
- [x] Landing page
- [x] Supabase local stack + 15-table schema + RLS
- [x] Google OAuth login → dashboard → create subject
- [x] Node worker skeleton (`apps/worker`)
- [x] Claude Code SDK PoC: Sonnet 4.6 + Haiku 4.5 roundtrip tested
- [x] Local embedding PoC: `multilingual-e5-base` (768d) with Vietnamese
- [x] Domain availability recorded in `scripts/check-domains.mjs`

Next: Phase 2 — Ingestion (upload + parse pipeline).
```

- [ ] **Step 18.3: Final commit**

```bash
git add README.md
git commit -m "docs: phase 1 foundation complete"
```

- [ ] **Step 18.4: Record outcome for Phase 2 planning**

Note these values (you'll need them in Phase 2):
- Embedding throughput (from Task 17.5)
- Whether `@anthropic-ai/claude-agent-sdk` package name / version had to change (Task 15.1 fallback)
- Any RLS policy you had to tweak for the subject-insert flow (Task 14.4)
- Chosen domain (Task 2.3)

Paste these as a comment in `docs/superpowers/plans/2026-04-23-phase1-foundation.md` at the very bottom, so Phase 2 planning has ground truth.

---

## Self-review notes

**Spec coverage checked against `2026-04-23-ongap-design.md`:**
- §4.1 Onboarding (Google login) → Tasks 11–13 ✓
- §4.2 Create subject → Task 14 ✓
- §5.1 Phase 0 stack (Next.js / Supabase / Worker with SDK / local embed) → Tasks 3, 6–17 ✓
- §5.2 Data model (15 tables including `flashcard_reviews`, `quiz_attempts`) → Tasks 7–10 ✓
- §5.3 Pipeline not yet wired — only SDK + embed PoC (Tasks 16, 17). Full pipeline lives in Phases 2–4. **Acceptable** per gate in spec §7 Tuần 1.
- §11 "Cần check" — domain probe (Task 2), SDK workflow (Task 16), embed PoC (Task 17). `marker` test and batched-extraction test are for Phase 2/3. ✓

**Type consistency:** `askClaude({ model: "sonnet" | "haiku" })` used consistently; `embedText`/`embedQuery` prefix contract matches the e5 model requirement.

**Placeholder scan:** no "TBD", "TODO", "handle edge cases" without code. One intentional deferral note in Task 16.3 (SDK event shape) with explicit instruction what to do if the shape differs — this is not a placeholder but a known-unknown disclosure.

**Scope check:** 18 tasks, all bite-sized. No task does more than scaffolding one coherent unit. Commits happen after each task (and sometimes inside) so rollback is easy.

# ÔnGấp — Phase 4 (Coverage Audit + Flashcard Derivation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After `processDocument` finishes inserting `entries` with status `done` from Phase 3, the orchestrator continues into a Sonnet 4.6 coverage audit (compares the document's heading outline against extracted concept names, writes a `coverage_audits` row with `coverage_pct` + `gaps_json`), and then derives flashcards from concept entries (no LLM: `front = name`, `back_verbatim = definition_verbatim`, `page_ref = page`, `difficulty` from importance). Document status flow becomes `extracting → auditing → done`.

**Architecture:** Two new pure modules under the worker — `audit/` (Sonnet 4.6 + Zod schema) and `generation/flashcards.ts` (pure SQL). The Phase 3 pipeline orchestrator gains an audit-then-flashcard step before flipping status to `done`. No new migrations: `coverage_audits` and `flashcards` already exist (see `supabase/migrations/20260423000003_content_tables.sql` and `_004_study_tables.sql`).

**Tech Stack:** `askClaude({model:'sonnet', ...})` via existing `apps/worker/src/claude/client.ts` (phase-1 verified). Zod for audit response validation. No new deps.

**Prerequisite:** Phase 3 commit on `main` (`4006395`); `processDocument` writes chunks + entries before this phase fires.

**Out of scope (Phase 5+):**
- Gap retry loop (auto re-process chunks where audit reports a missing concept).
- `back_paraphrase` LLM-generated flashcard backside (Phase 4 leaves it NULL).
- Quiz generation, exam prediction, chat RAG, gap-report worker, summary outline.
- SM-2 spaced repetition; `flashcard_reviews` rows are not produced here.
- UI: dashboard surfaces for coverage % and flashcard list (Phase 5+).

---

## File Structure (locked)

```
apps/worker/src/
  audit/
    schemas.ts                 # Zod audit response (NEW)
    prompt.ts                  # Sonnet audit prompt builder (NEW)
    audit.ts                   # askClaude(sonnet) + parse + validate + insert (NEW)
    audit.test.ts              # (NEW) — mocks askClaude + admin
  generation/
    flashcards.ts              # concept entry → flashcards rows (NEW)
    flashcards.test.ts         # (NEW) — mocks admin
  pipeline/
    process-document.ts        # (MODIFY) — call audit + flashcards after entries inserted
    process-document.test.ts   # (MODIFY) — assert audit + flashcards mocks invoked + status flow
docs/superpowers/plans/
  2026-04-28-phase4-audit-flashcards.md   # this file (NEW)
```

No migrations. No new npm deps.

---

## Task 1 — Audit response schema (Zod)

```ts
const AuditGapSchema = z.object({
  heading_path: z.string().min(1),
  reason: z.string().min(1),
});
const AuditResponseSchema = z.object({
  coverage_pct: z.number().min(0).max(1),  // 0..1
  gaps: z.array(AuditGapSchema).default([]),
  notes: z.string().default(""),
});
```

Coverage is stored in DB as `numeric(5,2)` so we accept 0..1 from the model and persist as `coverage_pct = response.coverage_pct` directly (the column is `between 0 and 1` per `coverage_audits.coverage_pct check (between 0 and 1)` — verify from existing migration).

## Task 2 — Audit prompt

Vietnamese system prompt: *"Bạn là người kiểm thính chất lượng cho pipeline trích xuất kiến thức."* Inputs:
- The document's **outline**: heading path of every chunk (deduplicated, in order).
- The document's **entries**: a JSON array `{type, name|expression|description, page}` (concept name only — no definition text, to keep prompt tight).

Output: a JSON object matching `AuditResponseSchema`. Coverage = (# of headings that are clearly represented by ≥1 concept) / (total headings). `gaps` lists heading paths with no matching concept. Strict JSON-only output, fence-tolerant on parse like Phase 3 extractor.

## Task 3 — Audit module (`audit/audit.ts`)

Signature: `auditDocument({ documentId, chunks, entries }): Promise<{ coveragePct, gapsJson }>`.

1. Build outline from `chunks[].heading_path` (preserve order, drop duplicates).
2. Build entries summary: `entries.map(e => ({ type, label: e.payload.name ?? e.payload.expression ?? e.payload.description, page: e.page_ref }))`.
3. `askClaude({ model: 'sonnet', prompt, maxTurns: 1 })`.
4. Reuse the Phase 3 `extractJsonArray`-style helper but for top-level `{...}` (rename to `extractJsonObject`). Validate with `AuditResponseSchema`.
5. Insert into `coverage_audits` row (`subject_id, document_id, outline_json, gaps_json, coverage_pct`).
6. Return `{ coveragePct, gapsJson }` (gapsJson is the validated `gaps` array).
7. Errors: log warn, return `{ coveragePct: 0, gapsJson: [] }` and DO NOT fail the pipeline. Audit is informational; flashcard derivation proceeds regardless.

## Task 4 — Flashcard derivation (`generation/flashcards.ts`)

Signature: `deriveFlashcards({ documentId, subjectId, entries }): Promise<number>` returning rows inserted.

1. Filter `entries` to `type === 'concept'`.
2. Map each concept to: `{ subject_id, entry_id, front, back_verbatim, back_paraphrase: null, page_ref, difficulty }`.
   - `front = payload.name`
   - `back_verbatim = payload.definition_verbatim`
   - `page_ref = payload.page ?? null`
   - `difficulty = clamp(payload.importance ?? 3, 1, 5)` (importance and difficulty share the 1-5 range; map directly).
3. Skip entries that already have a flashcard: `select entry_id from flashcards where entry_id in (...)` then exclude before insert.
4. Insert in batches of 100 into `public.flashcards`.
5. Return inserted count. On error → bubble (caller handles).

No LLM. Pure data transform.

## Task 5 — Pipeline orchestrator extension

In `pipeline/process-document.ts`:
1. After `extractAndInsertEntries` finishes successfully, capture the inserted `entries` rows (need their `id` + `payload_json` + `page_ref` + `subject_id` — extend the entry insert to `.select(...)`).
2. Set `status = 'auditing'`.
3. Call `auditDocument({ documentId, chunks, entries })`. Audit failure is logged but non-fatal.
4. Call `deriveFlashcards({ documentId, subjectId, entries })`. Flashcard failure IS fatal (status → failed).
5. Set `status = 'done'`.

Status sequence: `parsing → parsed → chunking → extracting → auditing → done`. Retain the existing `failed` short-circuit on hard errors.

## Task 6 — Tests

- `audit/audit.test.ts`:
  - mocks `askClaude` to return canned `{coverage_pct: 0.9, gaps: [], notes: ""}` JSON. Asserts `coverage_audits` insert payload and return value.
  - mocks `askClaude` to throw → asserts `auditDocument` returns `{coveragePct: 0, gapsJson: []}` (graceful).
  - mocks `askClaude` to return malformed JSON → also graceful.

- `generation/flashcards.test.ts`:
  - given 2 concept entries + 1 example entry, asserts only 2 flashcard rows inserted with correct field mapping.
  - given 1 concept entry that already has a flashcard (mock select returns its `entry_id`), asserts 0 inserts.
  - asserts `back_paraphrase: null` and `difficulty` matches importance.

- `pipeline/process-document.test.ts` (extend existing):
  - mock `auditDocument` and `deriveFlashcards`. Assert call order, status sequence `chunking → extracting → auditing → done`, and that audit failure does NOT mark document failed but flashcard failure DOES.

## Task 7 — README + plan + commit

- Add a "Phase 4 status (2026-04-28)" section to `README.md` mirroring Phase 3's format.
- Sign-off checklist: re-process the same slide → check `select coverage_pct, gaps_json from coverage_audits where document_id = '<id>';` and `select count(*) from flashcards where subject_id = '<id>';` (= concept count).

---

## Risk + open questions (non-blocking)

- Sonnet 4.6 latency: a single 30-chunk doc gives ~30 outline lines + ~150 entries → prompt ~5-10K tokens → ~3-8 s. Acceptable for one-time per-document audit, will revisit if rate limit issues surface.
- Audit `coverage_pct` is whatever the LLM says; we don't independently verify. That's fine — Phase 5 adds gap retry which actually closes the loop.
- If a concept entry has malformed payload (missing `name` or `definition_verbatim` somehow), flashcard insert fails NOT NULL constraint — Phase 3 Zod schema requires `name.min(1)` + `definition_verbatim.min(1)`, so this should never happen in practice; if it does we want to fail loud.

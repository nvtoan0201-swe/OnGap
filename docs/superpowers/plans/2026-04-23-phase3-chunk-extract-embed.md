# ÔnGấp — Phase 3 (Chunk → Extract → Embed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After `parseDocument` writes `parsed_markdown` + `status='parsed'`, the same worker run continues: heading-aware chunker splits the markdown into topic units (≤3000 tokens, ≥500 tokens, 200-token overlap on oversized splits); a batched Claude Haiku 4.5 pass extracts Concept/Example/Formula entries (5 chunks per call, validated with Zod); every chunk and every entry is embedded with the local `multilingual-e5-base` model and inserted into `public.chunks` and `public.entries` with 768-d vectors. Document status progresses `parsing → parsed → chunking → extracting → done`.

**Architecture:** Three new pure modules under the worker — `chunking/`, `extraction/`, and a new pipeline orchestrator `pipeline/process-document.ts`. Embedding uses the existing `apps/worker/src/embedding/embedder.ts`. Pgvector inserts serialize the float array via `JSON.stringify(arr)` which pgvector parses as its `'[...]'` text form. Coverage audit is explicitly deferred to Phase 4.

**Tech Stack:** Zod for entry schema validation; `askClaude({model:'haiku'})` wrapper from `apps/worker/src/claude/client.ts`; `@xenova/transformers` local embedder (already integrated in Phase 1).

**Prerequisite:** Phase 2 commit on `main`; the `chunks` and `entries` tables from migration `20260423000003_content_tables.sql` already exist with `embedding vector(768)` columns.

**Out of scope (Phase 4+):** coverage audit via Sonnet 4.6; gap retry; flashcard / quiz / exam prediction generation; UI improvements beyond the existing status badges (the label `"Đang trích xuất"` and `"Hoàn tất"` already render).

---

## File Structure (locked)

```
apps/worker/src/
  chunking/
    tokens.ts                  # approx token count (NEW)
    chunker.ts                 # heading-aware splitter (NEW)
    chunker.test.ts            # (NEW)
  extraction/
    schemas.ts                 # Zod Concept/Example/Formula (NEW)
    prompt.ts                  # batch prompt builder (NEW)
    extract.ts                 # askClaude + parse + validate (NEW)
    extract.test.ts            # (NEW) — mocks askClaude
  pipeline/
    process-document.ts        # chunk + embed + extract + embed + insert (NEW)
    process-document.test.ts   # (NEW) — mocks admin + embedder + extractor
    parse-document.ts          # (MODIFY) — call processDocument at end
docs/superpowers/plans/
  2026-04-23-phase3-chunk-extract-embed.md   # this file (NEW)
```

No migrations: all target tables already exist from Phase 1.

---

## Task 1 — Token counter

Minimal approximation: `Math.max(1, Math.ceil(text.length / 4))`. Good enough for chunk-size budgeting since Claude's context budget is generous; exact BPE count is not required.

## Task 2 — Heading-aware chunker

Input: parsed markdown with ATX headings (`#`, `##`, `###`) and `<!-- page: N -->` markers from the Phase 2 parsers.

Algorithm:
1. Walk lines; maintain a heading stack (`[{level, text}]`) and a current page int.
2. Every `<!-- page: N -->` line updates the current page.
3. Split into **sections** at every H1 or H2 boundary. Each section records the heading path (H1 > H2), the first and last page observed inside it, and its raw body text.
4. If a section has >3000 tokens: split it by blank-line-separated paragraphs, greedy-fill each sub-chunk to ≤3000 tokens, carry 200 tokens of tail overlap into the next sub-chunk.
5. If a section has <500 tokens and a previous section exists with the same H1 parent: merge it into the previous chunk (concat bodies, widen page range).
6. Documents with no headings at all → one single chunk with heading_path="(toàn văn)".

Output: `Chunk[] = { headingPath, pageFrom, pageTo, contentMd, tokenCount }`.

## Task 3 — Extraction schemas (Zod)

```ts
const ConceptSchema = z.object({
  type: z.literal("concept"),
  name: z.string().min(1),
  definition_verbatim: z.string().min(1),
  importance: z.number().int().min(1).max(5).default(3),
  related: z.array(z.string()).default([]),
  page: z.number().int().nullable().optional(),
});
const ExampleSchema = z.object({
  type: z.literal("example"),
  description: z.string().min(1),
  context: z.string().default(""),
  concept_ref: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
});
const FormulaSchema = z.object({
  type: z.literal("formula"),
  expression: z.string().min(1),
  variables: z.string().default(""),
  conditions: z.string().default(""),
  page: z.number().int().nullable().optional(),
});
const EntrySchema = z.discriminatedUnion("type", [
  ConceptSchema, ExampleSchema, FormulaSchema,
]);
const BatchSchema = z.array(z.object({
  chunk_id: z.string(),
  entries: z.array(EntrySchema),
}));
```

## Task 4 — Batched extractor

`extractBatch(batch: {id, headingPath, contentMd}[]): Promise<{chunk_id, entries}[]>`

1. Build a single prompt: Vietnamese system instruction ("trích xuất, không tóm tắt"), then each chunk wrapped in `<chunk id="…" heading="…">…</chunk>`, then a strict JSON-only output instruction with a schema example.
2. Call `askClaude({model:"haiku", prompt, maxTurns:1})`.
3. Extract the first JSON array from the assistant text with a simple `/(\[.*\])/s` regex guard, parse, validate with Zod.
4. On JSON/validation failure with batch size >1: recursively split the batch in half and retry (once). On failure with batch size 1: return `[]` for that chunk and log an error — don't kill the whole document.

## Task 5 — Pipeline orchestrator

`processDocument(documentId)`:
1. Load `documents` row (`id, subject_id, parsed_markdown`).
2. `status → 'chunking'`.
3. `chunkMarkdown(parsed_markdown)` → `Chunk[]`.
4. `initEmbedder()` then embed each chunk's `contentMd` with `embedText`.
5. `sb.from('chunks').insert(...).select('id, heading_path')` — capture inserted ids to wire chunk_id→real uuid for extraction.
6. `status → 'extracting'`.
7. Loop in batches of 5 inserted chunks, call `extractBatch`, flatten results.
8. For each extracted entry: derive importance (concept only, else 3), page ref (`entry.page ?? null`), payload_json = full entry object, embed the entry's searchable text (`entryToText`), insert into `entries` in batches of 50.
9. `status → 'done'`.
10. Errors at any step → `status = 'failed'` with error message.

## Task 6 — Wire into parse pipeline

Extend `parseDocument(documentId)`: after the existing update to `status='parsed'`, call `processDocument(documentId)` in the same job run. On success we end at `done`; on failure at any point we end at `failed`.

## Task 7 — Tests (all unit, mock Claude + Supabase + embedder)

- `chunker.test.ts`: 3 shapes — (a) three H2 sections under one H1 → three chunks with correct heading paths and page ranges; (b) a single huge H2 (>3000 tokens) splits into ≥2 sub-chunks with ~200-token overlap; (c) no headings → single "(toàn văn)" chunk.
- `extract.test.ts`: mocks `askClaude` to return canned JSON, asserts Zod validation + per-chunk grouping. Also tests the half-split retry path by throwing on first call.
- `process-document.test.ts`: mocks embedder + admin + extractor + chunker; asserts status transitions and that the correct rows land in `chunks` + `entries`.

## Task 8 — README + commit

Update README with Phase 3 status + user sign-off checklist.

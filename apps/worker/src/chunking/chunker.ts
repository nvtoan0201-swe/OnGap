import { approxTokens } from "./tokens.js";

export interface Chunk {
  headingPath: string;
  pageFrom: number | null;
  pageTo: number | null;
  contentMd: string;
  tokenCount: number;
}

interface HeadingFrame {
  level: number;
  text: string;
}

interface RawSection {
  headingPath: string;
  startedAt: { h1: string | null; h2: string | null };
  pages: Set<number>;
  body: string[];
}

const MAX_TOKENS = 3000;
const OVERLAP_TOKENS = 200;
const PAGE_MARKER = /^<!--\s*page:\s*(\d+)\s*-->\s*$/;
const ATX_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

function pathFromStack(stack: HeadingFrame[]): string {
  if (stack.length === 0) return "(toàn văn)";
  return stack.map((h) => h.text).join(" > ");
}

function minMax(pages: Set<number>): { from: number | null; to: number | null } {
  if (pages.size === 0) return { from: null, to: null };
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pages) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return { from: lo, to: hi };
}

/** Split one section's body into sub-chunks ≤ MAX_TOKENS with ~OVERLAP_TOKENS overlap. */
function splitOversized(section: RawSection): Chunk[] {
  const body = section.body.join("\n").trim();
  if (body.length === 0) return [];

  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: Chunk[] = [];
  const { from, to } = minMax(section.pages);

  let buf: string[] = [];
  let bufTokens = 0;

  const flush = (carryOverlap: boolean): string[] => {
    if (buf.length === 0) return [];
    const text = buf.join("\n\n");
    out.push({
      headingPath: section.headingPath,
      pageFrom: from,
      pageTo: to,
      contentMd: text,
      tokenCount: approxTokens(text),
    });
    if (!carryOverlap) return [];
    // Keep the last OVERLAP_TOKENS-worth of paragraphs as prefix of next buffer.
    const carry: string[] = [];
    let carryTok = 0;
    for (let i = buf.length - 1; i >= 0 && carryTok < OVERLAP_TOKENS; i--) {
      const p = buf[i]!;
      carry.unshift(p);
      carryTok += approxTokens(p);
    }
    return carry;
  };

  for (const p of paragraphs) {
    const pTok = approxTokens(p);
    if (bufTokens + pTok > MAX_TOKENS && buf.length > 0) {
      const carry = flush(true);
      buf = carry.slice();
      bufTokens = buf.reduce((s, x) => s + approxTokens(x), 0);
    }
    buf.push(p);
    bufTokens += pTok;
  }
  flush(false);
  return out;
}

function sectionToChunks(section: RawSection): Chunk[] {
  const body = section.body.join("\n").trim();
  if (body.length === 0) return [];
  const { from, to } = minMax(section.pages);
  const single: Chunk = {
    headingPath: section.headingPath,
    pageFrom: from,
    pageTo: to,
    contentMd: body,
    tokenCount: approxTokens(body),
  };
  if (single.tokenCount <= MAX_TOKENS) return [single];
  return splitOversized(section);
}

/**
 * Split a parsed-markdown document into heading-aware chunks.
 *
 * Splits at H1/H2 boundaries. H3+ stay inside their parent section.
 * Honors `<!-- page: N -->` markers to attach page ranges.
 * If a section exceeds MAX_TOKENS, splits paragraph-wise with a 200-token
 * overlap carried into the next sub-chunk.
 */
export function chunkMarkdown(md: string): Chunk[] {
  const lines = md.split(/\r?\n/);
  const stack: HeadingFrame[] = [];
  let currentPage: number | null = null;

  const sections: RawSection[] = [];
  let current: RawSection | null = null;

  const newSection = (): RawSection => {
    const s: RawSection = {
      headingPath: pathFromStack(stack),
      startedAt: {
        h1: stack[0]?.text ?? null,
        h2: stack[1]?.text ?? null,
      },
      pages: new Set<number>(),
      body: [],
    };
    sections.push(s);
    return s;
  };

  for (const raw of lines) {
    const line = raw.replace(/﻿/g, "");
    const pageMatch = line.match(PAGE_MARKER);
    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
      if (current && currentPage != null) current.pages.add(currentPage);
      continue;
    }
    const h = line.match(ATX_HEADING);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!.trim();
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
        stack.pop();
      }
      stack.push({ level, text });
      if (level <= 2) {
        current = newSection();
        if (currentPage != null) current.pages.add(currentPage);
      } else if (current) {
        current.body.push(line);
      } else {
        current = newSection();
        if (currentPage != null) current.pages.add(currentPage);
        current.body.push(line);
      }
      continue;
    }
    if (!current) {
      current = newSection();
      if (currentPage != null) current.pages.add(currentPage);
    }
    current.body.push(line);
  }

  return sections.flatMap(sectionToChunks);
}

import { parseOffice } from "officeparser";

export interface PptxParseResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

interface Node {
  type: string;
  text?: string;
  children?: Node[];
  metadata?: { slideNumber?: number };
}

function nodeText(node: Node): string {
  if (typeof node.text === "string" && node.text.length > 0) return node.text;
  if (Array.isArray(node.children)) {
    return node.children.map(nodeText).filter((t) => t.length > 0).join("\n");
  }
  return "";
}

/**
 * PPTX parser using officeparser v6 AST. Each top-level `slide` node becomes
 * one page; paragraphs inside are joined with newlines. Page markers let the
 * Phase 3 chunker recover slide numbers.
 */
export async function parsePptx(buf: Buffer): Promise<PptxParseResult> {
  const ast = await parseOffice(buf);
  const topContent = ast.content as unknown as Node[];
  const slides = Array.isArray(topContent)
    ? topContent.filter((n) => n.type === "slide")
    : [];

  const parts: string[] = [];
  let totalChars = 0;
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!;
    const pageNum = slide.metadata?.slideNumber ?? i + 1;
    const text = (slide.children ?? []).map(nodeText).filter((t) => t.length > 0).join("\n\n").trim();
    parts.push(`<!-- page: ${pageNum} -->\n\n${text}`);
    totalChars += text.length;
  }

  return {
    markdown: parts.join("\n\n"),
    pageCount: slides.length,
    totalChars,
  };
}

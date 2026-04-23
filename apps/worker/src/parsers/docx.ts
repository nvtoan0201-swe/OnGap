import mammoth from "mammoth";

export interface DocxParseResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

// mammoth's type declarations only expose convertToHtml, but convertToMarkdown
// has been shipped since 1.0. Cast narrowly for typecheck.
interface MammothWithMarkdown {
  convertToMarkdown(input: { buffer: Buffer }): Promise<{ value: string }>;
}
const mm = mammoth as unknown as MammothWithMarkdown;

export async function parseDocx(buf: Buffer): Promise<DocxParseResult> {
  const { value } = await mm.convertToMarkdown({ buffer: buf });
  const md = value.trim();
  return {
    markdown: md,
    pageCount: 1,
    totalChars: md.length,
  };
}

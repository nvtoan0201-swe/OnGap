import mammoth from "mammoth";

export interface DocxParseResult {
  markdown: string;
  pageCount: number;
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

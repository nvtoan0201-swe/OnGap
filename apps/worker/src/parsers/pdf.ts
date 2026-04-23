import { PDFParse } from "pdf-parse";

export interface PdfParseResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

/**
 * Text-path PDF parser. Uses pdf-parse v2's PDFParse class which exposes
 * per-page text directly. Emits HTML page-marker comments so the Phase 3
 * chunker can recover page numbers.
 */
export async function parsePdf(buf: Buffer): Promise<PdfParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const parts: string[] = [];
    let totalChars = 0;
    for (const page of result.pages) {
      const cleaned = (page.text ?? "").replace(/\r\n?/g, "\n").trim();
      parts.push(`<!-- page: ${page.num} -->\n\n${cleaned}`);
      totalChars += cleaned.length;
    }
    return {
      markdown: parts.join("\n\n"),
      pageCount: result.total,
      totalChars,
    };
  } finally {
    await parser.destroy();
  }
}

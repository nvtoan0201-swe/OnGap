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

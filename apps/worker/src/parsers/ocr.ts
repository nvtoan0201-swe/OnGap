import { pdf } from "pdf-to-img";
import { askClaudeVision } from "../claude/client.js";
import { logger } from "../logger.js";

export interface OcrResult {
  markdown: string;
  pageCount: number;
  totalChars: number;
}

const OCR_PROMPT = [
  "Day la mot slide / trang tai lieu hoc tap (co the tieng Viet).",
  "Hay OCR toan bo van ban nhin thay va tra ve Markdown.",
  "Giu nguyen heading (bat dau bang #), bullet (-), cong thuc (dung $...$).",
  "Chi tra ve noi dung trang, KHONG them loi giai thich, KHONG boc code fence.",
].join(" ");

/**
 * Rasterise each PDF page to PNG, then ask Claude Haiku Vision to transcribe
 * to Markdown. Used when the fast text parser's char density is too low
 * (likely a scan).
 */
export async function ocrPdf(buf: Buffer): Promise<OcrResult> {
  const document = await pdf(buf, { scale: 2.0 });
  const parts: string[] = [];
  let pageNum = 0;
  let totalChars = 0;

  for await (const image of document) {
    pageNum += 1;
    logger.info("ocr page", { pageNum });
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

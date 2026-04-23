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
  pipe = (await pipeline("feature-extraction", MODEL_ID)) as FeatureExtractionPipeline;
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

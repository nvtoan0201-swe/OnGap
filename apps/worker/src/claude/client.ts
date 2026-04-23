import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../logger.js";

export type ClaudeModel = "sonnet" | "haiku";

const MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface AskClaudeInput {
  model: ClaudeModel;
  prompt: string;
  /** Max agent turns — 1 for simple single-shot calls. */
  maxTurns?: number;
}

async function collectAssistantText(stream: AsyncIterable<unknown>): Promise<string> {
  let out = "";
  for await (const event of stream) {
    const ev = event as { type?: string; message?: { content?: unknown } };
    if (ev.type === "assistant") {
      const content = ev.message?.content;
      if (Array.isArray(content)) {
        for (const block of content as Array<{ type?: string; text?: string }>) {
          if (block.type === "text" && typeof block.text === "string") {
            out += block.text;
          }
        }
      }
    }
  }
  return out;
}

/**
 * Single-shot wrapper: ask Claude, collect the final assistant text.
 * Uses the authenticated `claude` CLI via Claude Agent SDK (no API key needed).
 */
export async function askClaude(input: AskClaudeInput): Promise<string> {
  const { model, prompt, maxTurns = 1 } = input;
  const modelId = MODEL_IDS[model];

  const stream = query({
    prompt,
    options: { model: modelId, maxTurns },
  });

  const out = await collectAssistantText(stream);
  logger.debug("askClaude completed", { model: modelId, chars: out.length });
  return out.trim();
}

export interface AskClaudeVisionInput {
  model: ClaudeModel;
  prompt: string;
  /** Raw image bytes (PNG or JPEG). */
  image: Buffer;
  imageExt?: "png" | "jpg";
  /** Max agent turns — vision calls need 2 (Read tool call + final text). */
  maxTurns?: number;
}

/**
 * Vision single-shot using the Claude Code agent's Read tool on a temp
 * image file. We write the buffer to a uniquely-named tmp dir, tell the
 * agent to read + analyse it, then clean up. This avoids having to encode
 * inline base64 content blocks (which the Agent SDK doesn't expose in its
 * public `query()` string-prompt surface).
 */
export async function askClaudeVision(input: AskClaudeVisionInput): Promise<string> {
  const { model, prompt, image, imageExt = "png", maxTurns = 3 } = input;
  const modelId = MODEL_IDS[model];
  const dir = await mkdtemp(join(tmpdir(), "ongap-vision-"));
  const filePath = join(dir, `img.${imageExt}`);

  try {
    await writeFile(filePath, image);
    const wrapped = [
      `Please Read the image at the following absolute path and follow the instructions below.`,
      `Image path: ${filePath}`,
      ``,
      `Instructions:`,
      prompt,
      ``,
      `Do NOT describe what you are doing. Output ONLY the final answer / transcription.`,
    ].join("\n");

    const stream = query({
      prompt: wrapped,
      options: {
        model: modelId,
        maxTurns,
        allowedTools: ["Read"],
      },
    });

    const out = await collectAssistantText(stream);
    logger.debug("askClaudeVision completed", { model: modelId, chars: out.length });
    return out.trim();
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (err) {
      logger.warn("tmp cleanup failed", { err: String(err) });
    }
  }
}

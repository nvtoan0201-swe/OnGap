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

/**
 * Single-shot wrapper: ask Claude, collect the final assistant text.
 * Uses the authenticated `claude` CLI via Claude Agent SDK (no API key needed).
 */
export async function askClaude(input: AskClaudeInput): Promise<string> {
  const { model, prompt, maxTurns = 1 } = input;
  const modelId = MODEL_IDS[model];

  let out = "";
  const stream = query({
    prompt,
    options: { model: modelId, maxTurns },
  });

  for await (const event of stream) {
    if (event.type === "assistant") {
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            out += block.text;
          }
        }
      }
    }
  }

  logger.debug("askClaude completed", { model: modelId, chars: out.length });
  return out.trim();
}

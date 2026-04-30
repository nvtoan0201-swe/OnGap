import { admin } from "../supabase/admin.js";
import { initEmbedder, embedQuery } from "../embedding/embedder.js";
import { askClaude } from "../claude/client.js";
import { logger } from "../logger.js";
import {
  buildChatPrompt,
  hitsToCitations,
  type ChatHit,
  type Citation,
} from "./prompt.js";

const MATCH_COUNT = 8;
const NOT_FOUND = "Không tìm thấy trong tài liệu.";

export interface AnswerInput {
  subjectId: string;
  query: string;
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
}

function toVectorLiteral(arr: number[]): string {
  return JSON.stringify(arr);
}

/**
 * Answer a chat query for one subject:
 * embed → top-K vector search → prompt → Haiku.
 *
 * Caller is trusted to have already verified the user owns `subjectId`.
 * Returns NOT_FOUND with empty citations if there are no hits.
 */
export async function answerQuery(input: AnswerInput): Promise<AnswerResult> {
  const { subjectId, query } = input;
  if (!query.trim()) {
    return { answer: NOT_FOUND, citations: [] };
  }

  await initEmbedder();
  const vec = await embedQuery(query);

  const sb = admin();
  const { data, error } = await sb.rpc("match_subject_entries", {
    p_subject_id: subjectId,
    p_query_embedding: toVectorLiteral(vec),
    p_match_count: MATCH_COUNT,
  });
  if (error) {
    logger.error("match_subject_entries failed", { err: error.message });
    throw new Error(`vector search failed: ${error.message}`);
  }

  const hits = (data ?? []) as ChatHit[];
  logger.info("chat hits", { subjectId, query: query.slice(0, 80), hits: hits.length });

  if (hits.length === 0) {
    return { answer: NOT_FOUND, citations: [] };
  }

  const prompt = buildChatPrompt(query, hits);
  const answer = await askClaude({ model: "haiku", prompt, maxTurns: 1 });
  return {
    answer: answer.trim() || NOT_FOUND,
    citations: hitsToCitations(hits),
  };
}

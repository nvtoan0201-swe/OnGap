import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { answerQuery } from "./answer.js";
import { logger } from "../logger.js";

const REQUEST_LIMIT = 4 * 1024; // 4 KB — chat queries are tiny

const RequestSchema = z.object({
  subjectId: z.string().uuid(),
  query: z.string().min(1).max(2000),
});

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > REQUEST_LIMIT) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST" || req.url !== "/chat") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    const raw = await readBody(req);
    const json = JSON.parse(raw);
    const parsed = RequestSchema.safeParse(json);
    if (!parsed.success) {
      sendJson(res, 400, { error: "invalid request", issues: parsed.error.flatten() });
      return;
    }
    const result = await answerQuery(parsed.data);
    sendJson(res, 200, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("chat handler failed", { err: msg });
    sendJson(res, 500, { error: msg });
  }
}

export function startChatServer(port: number): void {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      logger.error("chat handler crashed", { err: String(err) });
      try {
        sendJson(res, 500, { error: "internal" });
      } catch {
        // already sent
      }
    });
  });
  server.listen(port, "127.0.0.1", () => {
    logger.info("chat server listening", { port });
  });
}

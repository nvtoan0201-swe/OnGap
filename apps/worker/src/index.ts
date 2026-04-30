import { hostname } from "node:os";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { runLoop } from "./queue/poller.js";
import { startChatServer } from "./chat/server.js";

async function main() {
  const workerId = `${hostname()}-${process.pid}`;
  logger.info("worker booting", {
    supabaseUrl: config.SUPABASE_URL,
    logLevel: config.LOG_LEVEL,
    chatPort: config.CHAT_PORT,
    workerId,
  });
  startChatServer(config.CHAT_PORT);
  await runLoop(workerId);
}

main().catch((err) => {
  logger.error("worker fatal", { err: String(err) });
  process.exit(1);
});

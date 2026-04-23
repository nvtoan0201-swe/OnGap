import { config } from "./config.js";
import { logger } from "./logger.js";

async function main() {
  logger.info("worker booted", {
    supabaseUrl: config.SUPABASE_URL,
    logLevel: config.LOG_LEVEL,
  });
  // Phase 1: prove boot + env validation. Real job loop lands in Phase 2.
}

main().catch((err) => {
  logger.error("worker fatal", { err: String(err) });
  process.exit(1);
});

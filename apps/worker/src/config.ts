import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CHAT_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid worker config:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

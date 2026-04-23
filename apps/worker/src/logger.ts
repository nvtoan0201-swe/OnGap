type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const current: Level = (process.env.LOG_LEVEL as Level) ?? "info";

function log(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (order[level] < order[current]) return;
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => log("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
};

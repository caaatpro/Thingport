/**
 * A tiny levelled logger. `LOG_LEVEL` (debug | info | warn | error | silent, default info) picks the
 * threshold. Lines are plain text in a terminal and one JSON object per line when `LOG_FORMAT=json`.
 * Use this instead of console.* so output can be filtered and tests can silence it.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = keyof typeof LEVELS;

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in LEVELS ? LEVELS[raw as Level] : LEVELS.info;
}

function describe(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

function write(level: Exclude<Level, "silent">, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < threshold()) return;
  const fields = meta ? Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, describe(v)])) : undefined;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.LOG_FORMAT === "json") {
    sink(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }));
    return;
  }
  const extra = fields ? ` ${JSON.stringify(fields)}` : "";
  sink(`[${level}] ${message}${extra}`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};

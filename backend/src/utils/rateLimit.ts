import type { NextFunction, Request, Response } from "express";

type Options = {
  windowMs: number;
  max: number;
  message?: string;
  /** Tests flip this on; the default skips limiting under NODE_ENV=test. */
  enabled?: boolean;
};

type Bucket = { count: number; resetAt: number };

/** Fixed-window, per-IP limiter held in memory (one process serves the whole instance). */
export function rateLimit({ windowMs, max, message, enabled }: Options) {
  const buckets = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!(enabled ?? process.env.NODE_ENV !== "test")) return next();
    const now = Date.now();
    const key = req.ip ?? "unknown";
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: message ?? "Too many attempts. Try again in a few minutes." });
      return;
    }
    next();
  };
}

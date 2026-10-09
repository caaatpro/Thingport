import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

/** Logs each finished request at debug level (warn for 5xx), skipping the health probe. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const path = req.originalUrl.split("?")[0];
    if (path === "/api/health") return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const meta = { method: req.method, path, status: res.statusCode, ms: Math.round(ms) };
    if (res.statusCode >= 500) logger.warn("request failed", meta);
    else logger.debug("request", meta);
  });
  next();
}

import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { logger } from "../lib/logger";
import { HttpError } from "./errors";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ detail: "Not found" });
}

/** The last middleware: every thrown or rejected error ends up here and leaves as `{ detail, code? }`. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  // multer rejects (e.g. a file over the size limit) are the client's fault, not a 500: answer with a
  // clear 4xx so the UI can say "File too large" instead of a generic server error.
  if (err instanceof MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      detail: tooLarge ? "File is too large." : `Upload rejected: ${err.message}`,
      code: err.code,
    });
    return;
  }
  logger.error("Unhandled error", { method: req.method, path: req.originalUrl.split("?")[0], error: err });
  res.status(500).json({ detail: "Internal server error" });
}

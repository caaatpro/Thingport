import path from "node:path";
import type { Response } from "express";

type FileHeaders = {
  contentType: string;
  /** Cache-Control value; omitted when the response shouldn't be cached explicitly. */
  cacheControl?: string;
  /** Sends the file as a download under this name. */
  downloadName?: string;
};

/** Cache policy for content-addressed images and previews: the URL changes (`?v=mtime`) when they do. */
export const IMMUTABLE_PRIVATE_CACHE = "private, max-age=31536000, immutable";

export function sendStoredFile(res: Response, filePath: string, headers: FileHeaders): void {
  res.setHeader("Content-Type", headers.contentType);
  if (headers.downloadName !== undefined) {
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(headers.downloadName)}"`);
  }
  if (headers.cacheControl) res.setHeader("Cache-Control", headers.cacheControl);
  res.sendFile(path.resolve(filePath));
}

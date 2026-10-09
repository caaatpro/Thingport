import fs from "node:fs";
import type { Response } from "express";
import { writePrintsZip, type PrintWithPlatesAndCategory } from "./downloadZip";

/** Answers with the prints' files as a zip download and removes the temporary archive afterwards. */
export async function sendPrintsZip(
  res: Response,
  prints: PrintWithPlatesAndCategory[],
  downloadName: string,
  opts: { flatten?: boolean } = {},
): Promise<void> {
  const tmpPath = await writePrintsZip(prints, opts);
  res.download(tmpPath, downloadName, (err) => {
    fs.rm(tmpPath, { force: true }, () => undefined);
    if (err && !res.headersSent) {
      res.status(500).json({ detail: "Failed to send zip file" });
    }
  });
}

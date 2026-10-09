import path from "node:path";
import { HttpError } from "../../http/errors";
import { buildImportFilename, mimeFromContentType } from "../../lib/files";
import { listZipEntries } from "../prints/index";
import { downloadImportToTemp, removeTempFiles } from "./download";
import { openImportResponse } from "./resolveLink";
import type { ImportRequestBody } from "./types";

/** Inspects a link without downloading the file body: returns the filename/mime/is_zip/title it
 * would resolve to. */
export async function inspectImportLink(
  url: string,
  body: ImportRequestBody,
): Promise<{
  filename: string;
  mime: string;
  is_zip: boolean;
  title: string | null;
}> {
  const { response, finalUrl, meta } = await openImportResponse(url, body);
  await response.body?.cancel().catch(() => undefined);
  const filename = buildImportFilename(finalUrl, response.headers, body.filename ?? meta.filename);
  const mime = mimeFromContentType(response.headers.get("content-type"), filename);
  const isZip = path.extname(filename).toLowerCase() === ".zip";
  return { filename, mime, is_zip: isZip, title: meta.title };
}

/** Downloads a linked zip just long enough to list what's inside, for the "pick entries" step. */
export async function listZipImportEntries(url: string, body: ImportRequestBody) {
  const { tempPath, filename } = await downloadImportToTemp(url, body);
  try {
    if (path.extname(filename).toLowerCase() !== ".zip") throw new HttpError(415, "Imported file is not a zip");
    const entries = await listZipEntries(tempPath);
    if (!entries.length) throw new HttpError(400, "No files found in zip");
    return { filename, entries };
  } finally {
    await removeTempFiles([tempPath]);
  }
}

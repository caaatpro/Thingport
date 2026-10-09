import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { IMPORT_ALLOWED_EXTS, IMPORT_MAX_BYTES, IMPORT_USER_AGENT } from "../../config";
import { HttpError } from "../../http/errors";
import { buildImportFilename, guessMimeFromPath, mimeFromContentType, sanitizeFilename } from "../../lib/files";
import type { NewPlateInput } from "../prints/index";
import { rawFetch } from "./fetching";
import { openImportResponse } from "./resolveLink";
import type { ImportRequestBody, OpenImportResult, SavedImport } from "./types";

/** File types that become one plate each when a Thing, model or order bundles several files. */
export const MULTI_FILE_PLATE_EXTS = new Set([...IMPORT_ALLOWED_EXTS].filter((ext) => ext !== ".zip"));

async function streamToFileCapped(response: Response, destPath: string, maxBytes: number): Promise<number> {
  if (!response.body) {
    await fs.writeFile(destPath, Buffer.alloc(0));
    return 0;
  }
  const reader = response.body.getReader();
  const handle = await fs.open(destPath, "w");
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, "Imported file exceeds size limit");
      }
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return total;
}

/** Deletes temp files, ignoring ones that are already gone. */
export async function removeTempFiles(paths: Iterable<string>): Promise<void> {
  await Promise.all([...paths].map((p) => fs.rm(p, { force: true }).catch(() => undefined)));
}

/** Split out so a caller can inspect the resolved metadata before downloading the body. */
export async function saveImportResponseToTemp(
  { response, finalUrl, meta }: OpenImportResult,
  body: ImportRequestBody,
): Promise<SavedImport> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > IMPORT_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new HttpError(413, "Imported file exceeds size limit");
  }
  const filename = buildImportFilename(finalUrl, response.headers, body.filename ?? meta.filename);
  const mime = mimeFromContentType(response.headers.get("content-type"), filename);
  const suffix = path.extname(filename) || "";
  const tempPath = path.join(os.tmpdir(), `thingport-import-${crypto.randomBytes(8).toString("hex")}${suffix}`);
  try {
    await streamToFileCapped(response, tempPath, IMPORT_MAX_BYTES);
  } catch (err) {
    await removeTempFiles([tempPath]);
    throw err;
  }
  return { tempPath, filename, mime, meta };
}

/** Downloads `url` to a temp file without creating a Print (used by inspect/zip-entries/zip-extract). */
export async function downloadImportToTemp(url: string, body: ImportRequestBody): Promise<SavedImport> {
  return saveImportResponseToTemp(await openImportResponse(url, body), body);
}

type PlainDownloadResult = { input: NewPlateInput } | { rateLimited: true } | null;

/** Best-effort: null on failure so one bad file doesn't fail the whole import, except a 429,
 * which is reported so the caller can say why. */
async function downloadPlainFileToTemp(url: string, suggestedName: string): Promise<PlainDownloadResult> {
  try {
    const res = await rawFetch(url, {
      "User-Agent": IMPORT_USER_AGENT,
      Accept: "*/*",
    });
    if (res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      return { rateLimited: true };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const filename = sanitizeFilename(suggestedName);
    const tempFilePath = path.join(
      os.tmpdir(),
      `thingport-thingiverse-${crypto.randomBytes(8).toString("hex")}${path.extname(filename)}`,
    );
    await streamToFileCapped(res, tempFilePath, IMPORT_MAX_BYTES);
    return {
      input: { filename, mime: guessMimeFromPath(filename), tempFilePath },
    };
  } catch {
    return null;
  }
}

/** Downloads provider-listed files in parallel as plate inputs. `rateLimited` says a 429 caused a miss. */
export async function downloadPlainFiles(
  files: { url: string; name: string }[],
): Promise<{ inputs: NewPlateInput[]; rateLimited: boolean }> {
  const results = await Promise.all(files.map((f) => downloadPlainFileToTemp(f.url, f.name)));
  return {
    inputs: results
      .filter((result): result is { input: NewPlateInput } => result !== null && "input" in result)
      .map((result) => result.input),
    rateLimited: results.some((result) => result !== null && "rateLimited" in result),
  };
}

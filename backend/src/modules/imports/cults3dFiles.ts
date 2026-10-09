import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { IMPORT_MAX_BYTES } from "../../config";
import { HttpError } from "../../http/errors";
import { guessMimeFromPath, sanitizeFilename } from "../../lib/files";
import { listZipEntries, readZipEntry } from "../../lib/zipReader";
import type { NewPlateInput } from "../prints/index";
import { MULTI_FILE_PLATE_EXTS, removeTempFiles, saveImportResponseToTemp } from "./download";
import { openImportResponse } from "./resolveLink";
import type { ImportRequestBody } from "./types";

const MAX_ORDER_FILES = 50;

/** Model files inside a zip as plate inputs (temp files tracked in `temps` for cleanup). Empty when the
 *  archive holds none, so the caller keeps the zip itself. */
export async function unpackZipToPlateInputs(zipPath: string, temps: string[]): Promise<NewPlateInput[]> {
  const inputs: NewPlateInput[] = [];
  for (const entry of await listZipEntries(zipPath)) {
    const name = entry.name;
    if (entry.isDirectory || name.startsWith("__MACOSX/") || path.basename(name).startsWith(".")) continue;
    if (!MULTI_FILE_PLATE_EXTS.has(path.extname(name).toLowerCase())) continue;
    const buffer = await readZipEntry(zipPath, name, IMPORT_MAX_BYTES);
    if (!buffer) continue;
    const tempFilePath = path.join(os.tmpdir(), `thingport-cults3d-${crypto.randomBytes(8).toString("hex")}`);
    await fs.writeFile(tempFilePath, buffer);
    temps.push(tempFilePath);
    const filename = sanitizeFilename(path.basename(name));
    inputs.push({ filename, mime: guessMimeFromPath(filename), tempFilePath });
  }
  return inputs;
}

/** Downloads each file of a Cults3D order (links the extension resolved in the signed-in browser). Zips
 *  are unpacked into plates. Temp files are tracked in `temps` for cleanup. */
export async function downloadCults3dFiles(
  pageUrl: string,
  body: ImportRequestBody,
  files: { url: string; filename?: string | null }[],
  temps: string[],
): Promise<NewPlateInput[]> {
  const inputs: NewPlateInput[] = [];
  try {
    for (const file of files.slice(0, MAX_ORDER_FILES)) {
      const saved = await saveImportResponseToTemp(
        await openImportResponse(file.url, { ...body, resolved_download_url: null }, pageUrl, 1),
        { ...body, filename: file.filename || null },
      );
      temps.push(saved.tempPath);
      if (path.extname(saved.filename).toLowerCase() === ".zip") {
        const unpacked = await unpackZipToPlateInputs(saved.tempPath, temps);
        if (unpacked.length) {
          inputs.push(...unpacked);
          continue;
        }
      }
      inputs.push({
        filename: saved.filename,
        mime: saved.mime,
        tempFilePath: saved.tempPath,
      });
    }
    if (!inputs.length) throw new HttpError(400, "Cults3D returned no files.");
    return inputs;
  } catch (err) {
    await removeTempFiles(temps);
    throw err;
  }
}

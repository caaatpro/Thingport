import path from "node:path";
import { HttpError } from "../../http/errors";
import { createLog } from "../system/index";
import { upsertAuthorFromImport } from "../library/index";
import { createNotification } from "../system/index";
import { extractZipEntriesToPrints } from "../prints/index";
import { downloadImportToTemp, removeTempFiles } from "./download";
import { markJobFailed } from "./jobProgress";
import { updateJob } from "./jobService";
import type { ImportRequestBody } from "./types";

export type ZipImportJobBody = ImportRequestBody & { entries: string[] };

/** Downloads a zip and turns the chosen entries into prints (folders map to categories). */
export async function runZipImportJob(jobId: string, userId: string, body: ZipImportJobBody): Promise<void> {
  let tempPath: string | null = null;
  try {
    const downloaded = await downloadImportToTemp(body.url, body);
    tempPath = downloaded.tempPath;
    const { filename, meta } = downloaded;
    if (path.extname(filename).toLowerCase() !== ".zip") throw new HttpError(415, "Imported file is not a zip");

    await updateJob(jobId, { sourceLabel: filename, total: body.entries.length });

    const author = await upsertAuthorFromImport(meta.author);
    const { prints, failed } = await extractZipEntriesToPrints(
      userId,
      tempPath,
      body.entries,
      {
        title: body.title ?? meta.title,
        notes: body.notes ?? meta.description,
        tags: body.tags && body.tags.length ? body.tags : meta.tags,
        categoryId: body.category_id,
        creator: meta.creator,
        authorId: author?.id ?? null,
        previewImageUrl: meta.previewImageUrl,
        galleryImages: meta.galleryImages,
      },
      (processed, total, imported, failedSoFar) => {
        void updateJob(jobId, { processed, total, imported, failedCount: failedSoFar });
      },
    );

    await updateJob(jobId, {
      status: "DONE",
      processed: body.entries.length,
      imported: prints.length,
      failedCount: failed.length,
      resultPrintId: prints.length === 1 ? prints[0].id : null,
    });
    void createLog({
      userId,
      action: "import_completed",
      details: { provider: "zip", sourceLabel: filename, imported: prints.length, failed: failed.length },
    });

    await createNotification(userId, {
      title: `Imported ${prints.length} of ${body.entries.length} models from ${filename}`,
      body: failed.length ? `${failed.length} failed.` : null,
      externalUrl: body.url,
      internalPath: null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  } finally {
    if (tempPath) await removeTempFiles([tempPath]);
  }
}

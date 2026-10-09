import { IMPORT_MAKERWORLD_CALL_DELAY_MS } from "../../config";
import { HttpError } from "../../http/errors";
import { createLog } from "../system/index";
import { createNotification } from "../system/index";
import { parseMakerworldModelUrl } from "./providers/makerworld/urls";
import { selectMakerworldProfiles, type MakerworldProfileScope } from "./providers/makerworld/cloudApi";
import { resolveMakerworldCookie } from "./cookies";
import { importPrintFromUrl } from "./importPrint";
import { classifyImportFailure, describeOutcome, markJobFailed } from "./jobProgress";
import { updateJob } from "./jobService";
import { fetchMakerworldDesignForImport } from "./makerworldSource";
import { decodeHtmlEntities } from "./pageMetadata";
import type { ImportRequestBody } from "./types";

export type MakerworldProfilesImportJobBody = ImportRequestBody & { scope: Exclude<MakerworldProfileScope, "url"> };

/** Imports several print profiles of one MakerWorld model as one model with a file per profile. */
export async function runMakerworldProfilesImportJob(
  jobId: string,
  userId: string,
  body: MakerworldProfilesImportJobBody,
): Promise<void> {
  try {
    const parsed = parseMakerworldModelUrl(body.url);
    if (!parsed) throw new HttpError(400, "Not a MakerWorld model link");
    const design = await fetchMakerworldDesignForImport(
      parsed.designId,
      resolveMakerworldCookie(body),
      IMPORT_MAKERWORLD_CALL_DELAY_MS,
    );
    if (!design) throw new HttpError(400, "Couldn't read this model's print profiles from MakerWorld");
    const profileIds = selectMakerworldProfiles(design, body.scope, parsed.requestedInstanceId);
    if (!profileIds.length) throw new HttpError(400, "This model has no print profiles to import");
    const title =
      typeof design.title === "string" && design.title.trim() ? decodeHtmlEntities(design.title.trim()) : null;
    await updateJob(jobId, { total: profileIds.length, sourceLabel: title });

    let processed = 0;
    let imported = 0;
    let alreadyInLibrary = 0;
    let failed = 0;
    let stopReason: "rateLimited" | "auth" | null = null;
    let printId: string | null = null;
    for (const profileId of profileIds) {
      const profileUrl = `https://makerworld.com/en/models/${parsed.designId}#profileId-${profileId}`;
      if (stopReason) {
        failed++;
      } else {
        try {
          const result = await importPrintFromUrl(userId, profileUrl, {
            ...body,
            url: profileUrl,
            makerworldPaceMs: IMPORT_MAKERWORLD_CALL_DELAY_MS,
          });
          printId = result.print.id;
          if (result.alreadyImported) alreadyInLibrary++;
          else imported++;
        } catch (err) {
          failed++;
          const reason = classifyImportFailure(err);
          if (reason === "rateLimited" || reason === "auth") stopReason = reason;
        }
      }
      processed++;
      await updateJob(jobId, { processed, imported, alreadyInLibrary, failedCount: failed }).catch(() => undefined);
    }

    await updateJob(jobId, {
      status: "DONE",
      resultPrintId: printId,
      processed,
      imported,
      alreadyInLibrary,
      failedCount: failed,
    });
    void createLog({
      userId,
      action: "import_completed",
      targetId: printId,
      details: { provider: "makerworld", sourceLabel: title, imported, alreadyInLibrary, failed },
    });

    const parts: string[] = [];
    if (alreadyInLibrary) parts.push(`${alreadyInLibrary} already on the model`);
    if (stopReason === "rateLimited") {
      parts.push(
        `the rest blocked by a MakerWorld CAPTCHA challenge — this usually clears in 1-4 hours, then import the model again to add the missing profiles`,
      );
    } else if (stopReason === "auth") {
      parts.push(
        `the rest failed because your MakerWorld session expired — update the cookie in Settings and import again`,
      );
    } else if (failed) {
      parts.push(`${failed} failed`);
    }
    await createNotification(userId, {
      title: `Imported ${imported} of ${profileIds.length} print profiles from MakerWorld`,
      body: describeOutcome(`Of ${title ? `"${title}"` : "a MakerWorld model"}`, parts),
      externalUrl: body.url,
      internalPath: printId ? `/models/${printId}` : null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  }
}

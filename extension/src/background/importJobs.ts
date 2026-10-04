import type { ImportJob, Print } from "../shared/api";
import type { ImportSinglePayload } from "../shared/messages";
import { apiCall } from "./api";
import { recordRecentImport } from "./recentImports";

const JOB_POLL_INTERVAL_MS = 1000;

export async function pollJobToCompletion(jobId: string): Promise<ImportJob> {
  for (;;) {
    const job = await apiCall<ImportJob>("GET", `/import/jobs/${jobId}`);
    if (job.status !== "RUNNING") return job;
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
  }
}

/** One message covering import and collection filing, so both complete even if the tab navigates
 *  away: the background outlives the content script. */
export async function importSingle({
  url,
  entries,
  collectionId,
  resolved,
  title,
}: ImportSinglePayload): Promise<Print | null> {
  // A page-resolved download lets the backend skip the resolution calls that trip MakerWorld's
  // CAPTCHA. The profile id lets another profile of an existing model be added as a file.
  const extra = resolved?.downloadUrl
    ? {
        resolved_download_url: resolved.downloadUrl,
        resolved_instance_id: resolved.instanceId || null,
        makerworld_design: resolved.design ?? null,
        page_meta: resolved.pageMeta ?? null,
        resolved_files: resolved.files ?? null,
      }
    : null;

  let print: Print | null;
  if (entries) {
    const { job_id } = await apiCall<{ job_id: string }>("POST", "/import/zip", { url, entries, ...extra });
    const job = await pollJobToCompletion(job_id);
    if (job.status === "ERROR") throw new Error(job.error_message || "Import failed");
    print = job.result_print_id ? { id: job.result_print_id } : null;
  } else {
    print = await apiCall<Print>("POST", "/import", { url, ...extra });
  }

  if (collectionId && print?.id) {
    await apiCall("POST", `/collection/${collectionId}/items/${print.id}`).catch(() => undefined);
  }
  // Skip no-op imports. Adding a profile returns the existing model, moved to the front.
  if (print?.id && print.import_outcome !== "already_imported") {
    await recordRecentImport(print, title ?? null).catch(() => undefined);
  }
  return print;
}

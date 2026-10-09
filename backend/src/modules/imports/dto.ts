import type { ImportJob } from "../../generated/prisma/client";

export type ImportJobOut = {
  id: string;
  type: "COLLECTION" | "ZIP" | "PROFILES";
  status: "RUNNING" | "DONE" | "ERROR";
  source_url: string;
  source_label: string | null;
  provider: string | null;
  total: number;
  processed: number;
  imported: number;
  already_in_library: number;
  failed_count: number;
  error_message: string | null;
  result_collection_id: string | null;
  result_print_id: string | null;
};

export function toImportJobOut(job: ImportJob): ImportJobOut {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    source_url: job.sourceUrl,
    source_label: job.sourceLabel,
    provider: job.provider,
    total: job.total,
    processed: job.processed,
    imported: job.imported,
    already_in_library: job.alreadyInLibrary,
    failed_count: job.failedCount,
    error_message: job.errorMessage,
    result_collection_id: job.resultCollectionId,
    result_print_id: job.resultPrintId,
  };
}

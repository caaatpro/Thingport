import type { ImportJob } from "@/api/imports";
import type { UploadEntry } from "@/utils/uploadTree";

/** Every list that can show an imported or uploaded model; invalidate all of them after a change. */
export const LIBRARY_QUERY_PREFIXES = [
  "prints",
  "collections",
  "collection",
  "categories",
  "dashboard",
  "tags",
  "authors",
] as const;

const SYSTEM_COLLECTION_IDS = new Set(["favorites", "history"]);

export type ImportTarget = { categoryId: string | null; collectionId: string | null };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Where new models should land, read from the URL: the `category` search param on `/models…`, or the
 * `:collectionId` of `/models/collections/:collectionId` (the built-in favorites/history are not targets).
 */
export function resolveImportTarget(pathname: string, search: string): ImportTarget {
  const collectionMatch = pathname.match(/^\/models\/collections\/([^/]+)/);
  if (collectionMatch) {
    const id = safeDecode(collectionMatch[1]);
    return { categoryId: null, collectionId: SYSTEM_COLLECTION_IDS.has(id) ? null : id };
  }
  const inLibrary = pathname === "/models" || pathname.startsWith("/models/");
  const category = inLibrary ? new URLSearchParams(search).get("category") : null;
  return { categoryId: category || null, collectionId: null };
}

/** A folder pick always prefixes relativePath with the folder name, so this is true only for loose files. */
export function isFlatFileSet(entries: Pick<UploadEntry, "file" | "relativePath">[]): boolean {
  return entries.length > 1 && entries.every((entry) => entry.relativePath === entry.file.name);
}

/** Splits a pick into plain files and zips (zips get their own prompt). */
export function splitZips<T extends { file: { name: string } }>(entries: T[]): { normal: T[]; zips: T[] } {
  const isZip = (e: T) => e.file.name.toLowerCase().endsWith(".zip");
  return { normal: entries.filter((e) => !isZip(e)), zips: entries.filter(isZip) };
}

/** Where a finished job's result lives: one model, a collection, or the library when several landed. */
export function jobResultLink(job: ImportJob): { to: string; label: string } | null {
  if (job.status !== "DONE") return null;
  if (job.result_print_id) return { to: `/models/${job.result_print_id}`, label: "Open model" };
  if (job.result_collection_id)
    return { to: `/models/collections/${job.result_collection_id}`, label: "Open collection" };
  if (job.imported + job.already_in_library > 0) return { to: "/models", label: "Open library" };
  return null;
}

export function jobProgressPercent(job: Pick<ImportJob, "total" | "processed">): number | null {
  if (job.total <= 0) return null;
  return Math.min(100, Math.max(0, (job.processed / job.total) * 100));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 imported, 1 already in your library, 2 failed" (zero parts are left out). */
export function jobBreakdown(job: Pick<ImportJob, "imported" | "already_in_library" | "failed_count">): string {
  const parts: string[] = [];
  if (job.imported) parts.push(`${job.imported} imported`);
  if (job.already_in_library) parts.push(`${job.already_in_library} already in your library`);
  if (job.failed_count) parts.push(`${job.failed_count} failed`);
  return parts.join(", ");
}

/** The one-line message shown when a job leaves RUNNING. */
export function jobCompletionMessage(job: ImportJob): { tone: "success" | "warning" | "error"; message: string } {
  if (job.status === "ERROR") {
    return { tone: "error", message: job.error_message?.trim() || "Import failed. Try again." };
  }
  const breakdown = jobBreakdown(job);
  if (job.failed_count > 0) {
    return { tone: "warning", message: `Import finished: ${breakdown}.` };
  }
  if (job.imported === 0 && job.already_in_library > 0) {
    return {
      tone: "success",
      message: `Nothing new: ${plural(job.already_in_library, "model is", "models are")} already in your library.`,
    };
  }
  return { tone: "success", message: `Import complete: ${breakdown || "nothing to import"}.` };
}

export function jobTitle(job: Pick<ImportJob, "source_label" | "source_url">): string {
  return job.source_label?.trim() || job.source_url;
}

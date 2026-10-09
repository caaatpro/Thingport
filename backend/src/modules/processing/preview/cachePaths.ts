import fsSync from "node:fs";
import path from "node:path";
import { MODEL_PREVIEWS } from "../../../config";

// Cache file naming is an on-disk contract: change nothing here without a migration story.

// Part of the cache filename, so bumping it regenerates older GLBs on next view. Failure markers
// carry it too, so a file an older renderer refused gets another attempt.
export const PREVIEW_FORMAT_VERSION = 3;

export function modelPreviewGlbPath(plateId: string): string {
  return path.join(MODEL_PREVIEWS, `${plateId}.v${PREVIEW_FORMAT_VERSION}.glb`);
}

export function legacyModelPreviewGlbPath(plateId: string): string {
  return path.join(MODEL_PREVIEWS, `${plateId}.glb`);
}

export function modelPreviewErrorPath(plateId: string): string {
  return path.join(MODEL_PREVIEWS, `${plateId}.v${PREVIEW_FORMAT_VERSION}.error`);
}

export function legacyModelPreviewErrorPath(plateId: string): string {
  return path.join(MODEL_PREVIEWS, `${plateId}.error`);
}

/** Left behind when the process died mid-render (e.g. OOM), so that plate isn't retried
 * automatically. Delete it to allow another attempt. */
export function modelPreviewPendingPath(plateId: string): string {
  return path.join(MODEL_PREVIEWS, `${plateId}.pending`);
}

export function modelPreviewGlbExists(plateId: string): boolean {
  return fsSync.existsSync(modelPreviewGlbPath(plateId));
}

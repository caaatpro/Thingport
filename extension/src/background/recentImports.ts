// The popup's "Recent imports" strip, kept entirely in extension storage. Entries reflect the model
// as it was when imported.

import type { Print } from "../shared/api";
import type { RecentImport } from "../shared/messages";
import { normalizeInstanceUrl } from "../shared/storage";
import { apiFetchBlob } from "./api";
import { getStoredConfig, isConfigured, type ConfiguredConfig } from "./config";

const RECENT_IMPORTS_STORAGE_KEY = "recentImports";
const RECENT_IMPORTS_KEPT = 5;
const RECENT_IMPORT_THUMB_PX = 96;

async function readStored(): Promise<RecentImport[]> {
  const stored = await chrome.storage.local.get(RECENT_IMPORTS_STORAGE_KEY);
  return (stored[RECENT_IMPORTS_STORAGE_KEY] as RecentImport[] | undefined) ?? [];
}

/** `titleHint` covers zip imports, whose job reports only the id. Scoped to instance + account. */
export async function recordRecentImport(print: Print, titleHint: string | null): Promise<void> {
  const config = await getStoredConfig();
  if (!isConfigured(config)) return;
  const instanceUrl = normalizeInstanceUrl(config.instanceUrl);
  const thumbPath = print.thumb_url || print.preview_images?.[0]?.url || null;
  const entry: RecentImport = {
    printId: print.id,
    title: print.title || print.name || titleHint || null,
    url: `${instanceUrl}/models/${print.id}`,
    thumbDataUrl: thumbPath ? await fetchThumbDataUrl(config, thumbPath).catch(() => null) : null,
    instanceUrl,
    email: config.accountEmail ?? "",
  };
  // Another profile of a listed model moves it to the front instead of adding a slot.
  const rest = (await readStored()).filter(
    (e) => !(e.printId === entry.printId && e.instanceUrl === instanceUrl && e.email === entry.email),
  );
  await chrome.storage.local.set({ [RECENT_IMPORTS_STORAGE_KEY]: [entry, ...rest].slice(0, RECENT_IMPORTS_KEPT) });
}

/** A small center-cropped square JPEG data URL. */
async function fetchThumbDataUrl(config: ConfiguredConfig, thumbPath: string): Promise<string | null> {
  const blob = await apiFetchBlob(config, thumbPath);
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(RECENT_IMPORT_THUMB_PX, RECENT_IMPORT_THUMB_PX);
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      RECENT_IMPORT_THUMB_PX,
      RECENT_IMPORT_THUMB_PX,
    );
  bitmap.close();
  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
  let binary = "";
  for (let i = 0; i < jpeg.length; i += 0x8000) binary += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function getRecentImports(): Promise<RecentImport[]> {
  const config = await getStoredConfig();
  if (!isConfigured(config)) return [];
  const instanceUrl = normalizeInstanceUrl(config.instanceUrl);
  return (await readStored()).filter((e) => e.instanceUrl === instanceUrl && e.email === (config.accountEmail ?? ""));
}

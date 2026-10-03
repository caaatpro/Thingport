// Thingiverse and Printables import directly; other links go through /import/inspect first, like
// the web app's useUploadImport.tsx.

import type { InspectResult, ZipEntriesResult } from "../../shared/api";
import { request } from "../../shared/messages";
import { ctx } from "../context";
import { resolveMakerworldDownloadUrl, resolveMakerworldProfileDownload } from "../makerworld/downloadResolver";
import {
  currentMakerworldProfileTitle,
  loadMakerworldDesignForPage,
  makerworldProfileIds,
  type MakerworldProfileScope,
} from "../makerworld/pageData";
import { api, escapeHtml } from "../runtime";
import { onPanelAction, panelQuery, panelQueryAll, renderPanel } from "../shell";
import { collectionPickerHtml, selectedCollectionId } from "./collectionPicker";
import { errorHtml, statusHtml, successHtml } from "./results";

/** Model name for pages that skip /import/inspect. The <h1> first: Thingiverse's og:title goes
 *  stale on SPA navigation and Printables' has a suffix. */
function guessPageTitle(): string | null {
  const h1 = document.querySelector("h1")?.textContent?.trim();
  if (h1) return h1;
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  return og || document.title.trim() || null;
}

// Several profile resolutions in a quick burst still look automated to MakerWorld.
const PROFILE_GAP_MS = 2000;

/** The page's selected profile first, then "designer's" and "all" where they'd import more. */
async function profilesPickerHtml(): Promise<string> {
  const { url, classification } = ctx();
  if (classification.provider !== "makerworld" || classification.type !== "model") return "";
  const page = await loadMakerworldDesignForPage(url);
  if (!page) return "";
  const all = makerworldProfileIds(page.design, "all", page.requestedInstanceId).length;
  if (all < 2) return "";
  const designer = makerworldProfileIds(page.design, "designer", page.requestedInstanceId).length;
  const options = [`<option value="url">Currently selected print profile</option>`];
  if (designer > 1) options.push(`<option value="designer">All designer print profiles (${designer})</option>`);
  if (all > designer) options.push(`<option value="all">Designer &amp; community print profiles (${all})</option>`);
  return `
    <label class="tg-label" for="tg-profiles">Print profiles</label>
    <select id="tg-profiles" class="tg-select">${options.join("")}</select>
  `;
}

function selectedProfileScope(): MakerworldProfileScope {
  const value = panelQuery<HTMLSelectElement>("#tg-profiles")?.value;
  return value === "designer" || value === "all" ? value : "url";
}

function profileUrl(url: string, instanceId: string): string {
  return `${url.split("#")[0]}#profileId-${instanceId}`;
}

function importHeading(): string {
  const { title } = ctx();
  return title ? `Import "${escapeHtml(title)}"` : "Import this model";
}

export async function loadSingleItem(): Promise<void> {
  // A MakerWorld profile is always one 3MF, so inspecting would only cost a download resolution.
  if (ctx().library) {
    renderPanel(addProfileHtml(await profilesPickerHtml()));
    onPanelAction("import", () => void runDirectImport());
    return;
  }
  renderPanel(statusHtml("Checking link…"));
  const { provider, type } = ctx().classification;
  // A MakerWorld model is always one 3MF (the download is resolved on the page at import time), so
  // inspecting only made the user wait ~20 s for nothing -- and fail outright when MakerWorld
  // wouldn't hand the file to the server.
  const skipInspect =
    (provider === "thingiverse" && type === "thing") ||
    (provider === "printables" && type === "model") ||
    (provider === "makerworld" && type === "model");

  let zipFilename: string | null = null;
  if (skipInspect) {
    ctx().title = guessPageTitle();
  } else {
    try {
      const inspect = await api<InspectResult>("POST", "/import/inspect", { url: ctx().url });
      ctx().title = inspect.title || null;
      if (inspect.is_zip) zipFilename = inspect.filename ?? "This file";
    } catch (err) {
      renderPanel(errorHtml(err));
      return;
    }
  }

  if (zipFilename === null) {
    renderPanel(`
      <div class="tg-title">${importHeading()}</div>
      ${await profilesPickerHtml()}
      ${await collectionPickerHtml()}
      <button class="tg-btn" type="button" data-action="import">Import</button>
    `);
    onPanelAction("import", () => void runDirectImport());
    return;
  }

  renderPanel(`
    <div class="tg-title">${importHeading()}</div>
    <div class="tg-hint">${escapeHtml(zipFilename)} contains multiple files.</div>
    ${await collectionPickerHtml()}
    <button class="tg-btn" type="button" data-action="import-as-zip">Import as one model</button>
    <button class="tg-btn tg-btn--secondary" type="button" data-action="choose-files">Choose files…</button>
  `);
  onPanelAction("import-as-zip", () => void runDirectImport());
  onPanelAction("choose-files", () => void loadZipEntries());
}

/** The model's in the library but this profile may not be. */
function addProfileHtml(profilesPicker: string): string {
  const { library, url, instanceUrl } = ctx();
  const profileName = currentMakerworldProfileTitle(url);
  const profileLabel = profileName ? `the "${escapeHtml(profileName)}" profile` : "this print profile";
  const hint =
    library?.state === "profile_missing"
      ? `You already have this model. Add ${profileLabel} as another file on it?`
      : `This model is in your library. Add ${profileLabel} if you don't have it yet -- if one of the model's files already is this profile, nothing is downloaded twice.`;
  const modelLink = library?.printId ? `${instanceUrl}/models/${library.printId}` : `${instanceUrl}/models`;
  return `
    <div class="tg-title">In your library</div>
    <div class="tg-hint">${hint}</div>
    ${profilesPicker}
    <button class="tg-btn" type="button" data-action="import">Add profile</button>
    <a class="tg-btn tg-btn--secondary" href="${escapeHtml(modelLink)}" target="_blank" rel="noopener noreferrer">Open model in Thingport</a>
  `;
}

async function loadZipEntries(): Promise<void> {
  renderPanel(statusHtml("Loading files…"));
  let result: ZipEntriesResult;
  try {
    result = await api<ZipEntriesResult>("POST", "/import/zip/entries", { url: ctx().url });
  } catch (err) {
    renderPanel(errorHtml(err));
    return;
  }
  const rows = result.entries
    .map(
      (entry) => `
        <label class="tg-entry">
          <input type="checkbox" class="tg-entry__checkbox" value="${escapeHtml(entry)}" checked />
          <span class="tg-entry__name">${escapeHtml(entry)}</span>
        </label>
      `,
    )
    .join("");
  renderPanel(`
    <div class="tg-title">Choose files to import</div>
    <div class="tg-entries">${rows}</div>
    ${await collectionPickerHtml()}
    <button class="tg-btn" type="button" data-action="import">Import selected</button>
  `);
  onPanelAction("import", () => {
    const entries = panelQueryAll<HTMLInputElement>(".tg-entry__checkbox:checked").map((el) => el.value);
    if (entries.length) void runDirectImport({ entries });
  });
}

async function runDirectImport(opts?: { entries?: string[] }): Promise<void> {
  // Captured up front: SPA navigation clears the context mid-import.
  const collectionId = selectedCollectionId();
  const scope = selectedProfileScope();
  if (scope !== "url") {
    await runProfilesImport(scope, collectionId);
    return;
  }
  const { url, instanceUrl, classification, title } = ctx();
  renderPanel(statusHtml("Importing…"));
  const resolved =
    classification.provider === "makerworld" && classification.type === "model"
      ? await resolveMakerworldDownloadUrl(url).catch(() => null)
      : null;
  try {
    // One message so import and collection filing finish even if the page is gone.
    const print = await request("IMPORT_SINGLE", { url, entries: opts?.entries, collectionId, resolved, title });
    const link = print ? `${instanceUrl}/models/${print.id}` : `${instanceUrl}/models`;
    if (print?.import_outcome === "profile_added") {
      renderPanel(successHtml(link, "Added this print profile's file to the model you already had.", "Profile added"));
    } else if (print?.import_outcome === "already_imported") {
      renderPanel(
        successHtml(
          link,
          "This print profile's file was already on the model -- nothing new was added.",
          "Already in your library",
        ),
      );
    } else {
      renderPanel(successHtml(link));
    }
  } catch (err) {
    renderPanel(errorHtml(err, importErrorHint()));
  }
}

/** MakerWorld only hands out files to a logged-in browser session, which is by far the most common
 *  reason an import from it fails. */
function importErrorHint(): string | undefined {
  return ctx().classification.provider === "makerworld"
    ? "MakerWorld only lets signed-in users download files. Log in to makerworld.com in this browser, make sure “Share my MakerWorld session” is on in the Thingport Grab popup, reload the page and try again."
    : undefined;
}

/** The first profile creates (or finds) the model; later ones are added as files. Stops on a
 *  CAPTCHA, which would fail every later one. */
async function runProfilesImport(scope: MakerworldProfileScope, collectionId: string | null): Promise<void> {
  const { url, instanceUrl, title } = ctx();
  const page = await loadMakerworldDesignForPage(url);
  const ids = page ? makerworldProfileIds(page.design, scope, page.requestedInstanceId) : [];
  if (!ids.length) {
    renderPanel(errorHtml(new Error("Couldn't read this model's print profiles. Reload the page and try again.")));
    return;
  }

  let added = 0;
  let already = 0;
  let failed = 0;
  let lastError: unknown = null;
  let printId: string | null = null;
  for (const [index, instanceId] of ids.entries()) {
    renderPanel(statusHtml(`Importing print profile ${index + 1} of ${ids.length}…`));
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, PROFILE_GAP_MS));
    // The page's Download button gives exactly the link's profile.
    const resolved =
      index === 0
        ? await resolveMakerworldDownloadUrl(url).catch(() => null)
        : await resolveMakerworldProfileDownload(url, instanceId).catch(() => null);
    try {
      const print = await request("IMPORT_SINGLE", {
        url: index === 0 ? url : profileUrl(url, instanceId),
        collectionId,
        resolved,
        title,
      });
      printId = print?.id ?? printId;
      if (print?.import_outcome === "already_imported") already++;
      else added++;
    } catch (err) {
      failed++;
      lastError = err;
      if (err instanceof Error && /captcha/i.test(err.message)) {
        failed += ids.length - index - 1;
        break;
      }
    }
  }

  if (!printId) {
    renderPanel(errorHtml(lastError ?? new Error("Import failed"), importErrorHint()));
    return;
  }
  const parts = [`${added} print profile${added === 1 ? "" : "s"} imported`];
  if (already) parts.push(`${already} already on the model`);
  if (failed) parts.push(`${failed} failed`);
  renderPanel(
    successHtml(`${instanceUrl}/models/${printId}`, `${parts.join(", ")}.`, failed ? "Partly imported" : undefined),
  );
}

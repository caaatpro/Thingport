// Toolbar popup (or a tab, when the browser won't open the popup): the setup form until configured,
// then the enable switch and recent imports.

import { fillIcons } from "../shared/icon";
import { send, sendToTab, type ExtensionState } from "../shared/messages";
import { instanceUrlProblem, normalizeInstanceUrl } from "../shared/storage";
import { classifyUrl } from "../shared/urls";
import { clearError, els, showError } from "./dom";
import { loadRecentImports } from "./recentImports";
import "./styles/popup.scss";

// When opened as a tab from a page's setup dialog, return there once saved.
const returnTabId = Number.parseInt(new URLSearchParams(location.search).get("returnTab") ?? "", 10);

fillIcons(document);

// The instance origin the extension currently holds a host permission for, so it can be dropped when
// the user points the extension somewhere else or disconnects.
let connectedOrigin: string | null = null;

function originOf(url: string): string | null {
  try {
    return new URL(normalizeInstanceUrl(url)).origin;
  } catch {
    return null;
  }
}

async function dropHostPermission(origin: string | null): Promise<void> {
  if (!origin) return;
  await chrome.permissions.remove({ origins: [`${origin}/*`] }).catch(() => undefined);
}

function displayInstanceUrl(instanceUrl: string): string {
  return instanceUrl.replace(/^https?:\/\//i, "");
}

// --- "What do I do now?": the action for the tab the user is looking at ---------------------------

const SITE_NAMES: Record<string, string> = {
  makerworld: "MakerWorld",
  printables: "Printables",
  thingiverse: "Thingiverse",
  cults3d: "Cults3D",
};

function showPageLinks(title: string, hint: string): void {
  els.pageTitle.textContent = title;
  els.pageHint.textContent = hint;
  els.pageAction.hidden = true;
  els.pageLinks.hidden = false;
}

/** Opens the import panel on that tab. A tab that was already open when the extension was installed
 *  has no content script yet (browsers only inject on the next load), so attach it first. */
async function openImportPanel(tabId: number): Promise<boolean> {
  const tryOpen = async () => {
    try {
      const reply = await sendToTab(tabId, "OPEN_IMPORT_PANEL");
      return Boolean(reply?.ok && reply.data);
    } catch {
      return undefined; // nobody is listening in that tab
    }
  };
  let opened = await tryOpen();
  if (opened === undefined) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    // The script checks the instance before it mounts its icon; give it a moment.
    for (let i = 0; i < 12 && !opened; i++) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      opened = await tryOpen();
    }
  }
  return Boolean(opened);
}

// What the page button does right now; set by renderPageSection for the tab being shown.
let pageAction: (() => Promise<void>) | null = null;
els.pageAction.addEventListener("click", () => void pageAction?.());

async function renderPageSection(state: ExtensionState): Promise<void> {
  clearError(els.pageError);
  pageAction = null;
  if (state.disabled) {
    showPageLinks("Thingport Grab is switched off", "Turn on “Extension enabled” below to import.");
    els.pageLinks.hidden = true;
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const classification = tab?.url ? classifyUrl(tab.url) : null;
  if (!tab?.id || !classification) {
    showPageLinks(
      "Ready to import",
      "Open a model on one of these sites. Then click the green Thingport button in the corner of the page, or open this popup again and press Import.",
    );
    return;
  }
  const tabId = tab.id;
  const site = SITE_NAMES[classification.provider];
  els.pageTitle.textContent =
    classification.kind === "batch" ? `Import this ${site} collection` : `Import this ${site} model`;
  els.pageHint.textContent = "Opens the import panel on the page, where you can pick a collection first.";
  els.pageLinks.hidden = true;
  els.pageAction.hidden = false;
  els.pageAction.textContent = classification.kind === "batch" ? "Import collection" : "Import this model";
  pageAction = async () => {
    clearError(els.pageError);
    els.pageAction.disabled = true;
    els.pageAction.textContent = "Opening…";
    try {
      if (await openImportPanel(tabId)) {
        window.close();
        return;
      }
      showError("Couldn't open the import panel on this page. Reload the page and try again.", els.pageError);
    } catch {
      showError("Couldn't reach this page. Reload it and try again.", els.pageError);
    } finally {
      els.pageAction.disabled = false;
      els.pageAction.textContent = classification.kind === "batch" ? "Import collection" : "Import this model";
    }
  };
}

function showConfiguredView(state: ExtensionState): void {
  els.configuredView.hidden = false;
  els.setupForm.hidden = true;
  els.instanceRow.hidden = false;
  els.instanceUrlText.textContent = displayInstanceUrl(state.instanceUrl);
  els.instanceUrlText.title = state.instanceUrl;
  els.accountText.textContent = state.account ? `Connected as ${state.account}` : "";
  els.accountText.hidden = !state.account;
  els.enabledSwitch.checked = !state.disabled;
  els.shareSessionSwitch.checked = state.shareMakerworldSession;
  clearError(els.configuredError);
  if (state.tokenRejected) {
    showError(
      "Thingport no longer accepts this extension's API token -- it was revoked or has expired. Click the pencil above to connect with a new one.",
      els.rejectedBanner,
    );
  } else {
    clearError(els.rejectedBanner);
  }
  resetDisconnectButton();
  void renderPageSection(state);
  void loadRecentImports();
}

function showSetupForm(prefillUrl = "", canCancel = false): void {
  els.configuredView.hidden = true;
  els.instanceRow.hidden = true;
  els.setupForm.hidden = false;
  els.cancelBtn.hidden = !canCancel;
  els.instanceUrlInput.value = prefillUrl;
  els.tokenInput.value = "";
  clearError();
  (prefillUrl ? els.tokenInput : els.instanceUrlInput).focus();
}

async function refresh(): Promise<void> {
  const res = await send("GET_STATE");
  if (!res?.ok) {
    showError(res?.error ?? "The extension background isn't responding");
    return;
  }
  connectedOrigin = res.data.instanceUrl ? originOf(res.data.instanceUrl) : null;
  if (res.data.configured) showConfiguredView(res.data);
  // Not connected yet -- or upgraded from a version that signed in with a password, which keeps the
  // address and now only needs a token.
  else showSetupForm(res.data.instanceUrl);
}

els.editInstanceBtn.addEventListener("click", async () => {
  const res = await send("GET_STATE");
  showSetupForm(res?.ok ? res.data.instanceUrl : "", true);
});

els.cancelBtn.addEventListener("click", () => void refresh());

els.enabledSwitch.addEventListener("change", async () => {
  clearError(els.configuredError);
  els.enabledSwitch.disabled = true;
  const res = await send("SET_DISABLED", { disabled: !els.enabledSwitch.checked });
  els.enabledSwitch.disabled = false;
  if (!res?.ok) {
    showError(res?.error ?? "Couldn't save", els.configuredError);
    els.enabledSwitch.checked = !els.enabledSwitch.checked;
  }
});

els.shareSessionSwitch.addEventListener("change", async () => {
  clearError(els.configuredError);
  els.shareSessionSwitch.disabled = true;
  const res = await send("SET_SHARE_MAKERWORLD_SESSION", { share: els.shareSessionSwitch.checked });
  els.shareSessionSwitch.disabled = false;
  if (!res?.ok) {
    showError(res?.error ?? "Couldn't save", els.configuredError);
    els.shareSessionSwitch.checked = !els.shareSessionSwitch.checked;
  }
});

// Disconnecting needs a second click, so a stray one can't wipe the connection.
let disconnectArmedTimer: ReturnType<typeof setTimeout> | null = null;

function resetDisconnectButton(): void {
  if (disconnectArmedTimer) clearTimeout(disconnectArmedTimer);
  disconnectArmedTimer = null;
  els.disconnectBtn.textContent = "Disconnect";
}

els.disconnectBtn.addEventListener("click", async () => {
  if (!disconnectArmedTimer) {
    els.disconnectBtn.textContent = "Click again to disconnect";
    disconnectArmedTimer = setTimeout(resetDisconnectButton, 4000);
    return;
  }
  resetDisconnectButton();
  clearError(els.configuredError);
  const res = await send("DISCONNECT");
  if (!res?.ok) {
    showError(res?.error ?? "Couldn't disconnect", els.configuredError);
    return;
  }
  await dropHostPermission(connectedOrigin);
  connectedOrigin = null;
  await refresh();
});

// Chrome shows its permission prompt in a separate window, which can close this popup before the
// prompt is answered -- and with it the half-finished save. What the user typed is kept in session
// storage (memory only, never written to disk, cleared when the browser closes) so the save can be
// finished when the popup reopens.
const DRAFT_KEY = "setupDraft";
type Draft = { instanceUrl: string; token: string };

async function saveDraft(draft: Draft): Promise<void> {
  await chrome.storage.session?.set({ [DRAFT_KEY]: draft }).catch(() => undefined);
}

async function takeDraft(): Promise<Draft | null> {
  if (!chrome.storage.session) return null;
  const stored = await chrome.storage.session.get(DRAFT_KEY).catch(() => ({}) as Record<string, unknown>);
  await chrome.storage.session.remove(DRAFT_KEY).catch(() => undefined);
  const draft = stored[DRAFT_KEY] as Draft | undefined;
  return draft && typeof draft.instanceUrl === "string" && typeof draft.token === "string" ? draft : null;
}

function setSaving(saving: boolean, label = "Saving…"): void {
  els.saveBtn.disabled = saving;
  els.saveBtn.textContent = saving ? label : "Save";
}

/** Sends the validated values to the background and shows the result. */
async function finishSave(instanceUrl: string, token: string): Promise<void> {
  const origin = new URL(instanceUrl).origin;
  setSaving(true);
  try {
    const res = await send("SAVE_CONFIG", { instanceUrl, token });
    if (!res?.ok) {
      showError(res?.error ?? "Couldn't save");
      return;
    }
    // Pointing at a different instance: stop holding access to the old one.
    if (connectedOrigin && connectedOrigin !== origin) await dropHostPermission(connectedOrigin);
    connectedOrigin = origin;
    els.tokenInput.value = "";
    if (Number.isInteger(returnTabId)) {
      await chrome.tabs.update(returnTabId, { active: true }).catch(() => undefined);
      const self = await chrome.tabs.getCurrent();
      if (self?.id != null) await chrome.tabs.remove(self.id);
      return;
    }
    await refresh();
  } finally {
    setSaving(false);
  }
}

els.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const problem = instanceUrlProblem(els.instanceUrlInput.value);
  if (problem) {
    showError(problem);
    return;
  }
  const instanceUrl = normalizeInstanceUrl(els.instanceUrlInput.value);
  const token = els.tokenInput.value;
  const access = { origins: [`${new URL(instanceUrl).origin}/*`] };

  // permissions.request() needs this submit's user gesture, so it has to happen here.
  if (!(await chrome.permissions.contains(access))) {
    setSaving(true, "Waiting for permission…");
    await saveDraft({ instanceUrl, token });
    let granted = false;
    try {
      granted = await chrome.permissions.request(access);
    } finally {
      setSaving(false);
    }
    if (!granted) {
      await takeDraft();
      showError("Thingport Grab needs permission to reach this instance to work.");
      return;
    }
  }
  await takeDraft();
  await finishSave(instanceUrl, token);
});

/** The popup was closed by the permission prompt: finish what the user started. */
async function resumeInterruptedSave(): Promise<boolean> {
  const draft = await takeDraft();
  if (!draft) return false;
  showSetupForm(draft.instanceUrl);
  els.tokenInput.value = draft.token;
  const access = { origins: [`${new URL(draft.instanceUrl).origin}/*`] };
  if (await chrome.permissions.contains(access)) {
    await finishSave(draft.instanceUrl, draft.token);
  } else {
    showError("Access to your instance wasn't allowed yet. Click Save and choose Allow.");
  }
  return true;
}

window.addEventListener("focus", () => {
  if (!els.configuredView.hidden) void send("GET_STATE").then((res) => res?.ok && void renderPageSection(res.data));
});

void resumeInterruptedSave().then((resumed) => (resumed ? undefined : refresh()));

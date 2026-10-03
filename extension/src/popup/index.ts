// Toolbar popup (or a tab, when the browser won't open the popup): the setup form until configured,
// then the enable switch and recent imports.

import { fillIcons } from "../shared/icon";
import { send, type ExtensionState } from "../shared/messages";
import { instanceUrlProblem, normalizeInstanceUrl } from "../shared/storage";
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

els.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const problem = instanceUrlProblem(els.instanceUrlInput.value);
  if (problem) {
    showError(problem);
    return;
  }
  const normalized = normalizeInstanceUrl(els.instanceUrlInput.value);
  const origin = new URL(normalized).origin;

  els.saveBtn.disabled = true;
  els.saveBtn.textContent = "Saving…";
  try {
    // Must happen here: permissions.request() needs this submit's user gesture.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      showError("Thingport Grab needs permission to reach this instance to work.");
      return;
    }
    const res = await send("SAVE_CONFIG", { instanceUrl: normalized, token: els.tokenInput.value });
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
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = "Save";
  }
});

void refresh();

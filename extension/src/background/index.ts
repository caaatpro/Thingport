// Background entry point (service worker in Chrome/Edge, event page in Firefox). Owns config, auth
// and every request to the Thingport instance.

import { listen, type BackgroundMessages } from "../shared/messages";
import { isProviderPageUrl } from "../shared/urls";
import { apiCall } from "./api";
import {
  disconnect,
  getState,
  purgeLegacyCredentials,
  saveConfig,
  setDisabled,
  setShareMakerworldSession,
} from "./config";
import { armDownloadCapture, awaitDownloadCapture } from "./downloadCapture";
import { importSingle } from "./importJobs";
import { resolveCults3dFileLink } from "./resolveRedirect";
import { abortJob, advanceJob, dropJobIfForTab, forceAdvanceJob, getJobForTab, startJob } from "./makerworldJob";
import { getRecentImports } from "./recentImports";
import { openSetup } from "./setup";
import { setTabIconState } from "./tabIcon";

/** Anything that changes which server the extension talks to (and so who receives the token and the
 *  MakerWorld session) is only honoured from the extension's own pages, i.e. the popup. Content scripts
 *  run inside third-party pages, so they must never be able to repoint it. */
function requireExtensionPage(sender: chrome.runtime.MessageSender): void {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) {
    throw new Error("This action is only available from the extension's own pages");
  }
}

/** Acting on the user's Thingport account (importing, filing into collections) is only honoured from
 *  the content scripts this extension injects into the supported sites. */
function requireProviderPage(sender: chrome.runtime.MessageSender): void {
  if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url || !isProviderPageUrl(sender.url)) {
    throw new Error("This action is only available from a supported model site");
  }
}

function senderTabId(sender: chrome.runtime.MessageSender): number {
  if (!sender.tab?.id) throw new Error("This action is only available from a page");
  return sender.tab.id;
}

listen<BackgroundMessages>({
  GET_STATE: () => getState(),
  SAVE_CONFIG: (payload, sender) => {
    requireExtensionPage(sender);
    return saveConfig(payload);
  },
  SET_DISABLED: ({ disabled }, sender) => {
    requireExtensionPage(sender);
    return setDisabled(disabled);
  },
  SET_SHARE_MAKERWORLD_SESSION: ({ share }, sender) => {
    requireExtensionPage(sender);
    return setShareMakerworldSession(share);
  },
  DISCONNECT: (_payload, sender) => {
    requireExtensionPage(sender);
    return disconnect();
  },
  GET_RECENT_IMPORTS: (_payload, sender) => {
    requireExtensionPage(sender);
    return getRecentImports();
  },
  OPEN_SETUP: (_payload, sender) => {
    requireProviderPage(sender);
    return openSetup(sender.tab?.id);
  },
  SET_TAB_ICON_STATE: ({ active }, sender) => setTabIconState(senderTabId(sender), active),
  API_CALL: ({ method, path, body }, sender) => {
    requireProviderPage(sender);
    return apiCall(method, path, body);
  },
  IMPORT_SINGLE: (payload, sender) => {
    requireProviderPage(sender);
    return importSingle(payload);
  },
  START_MAKERWORLD_COLLECTION_JOB: (payload, sender) => startJob(senderTabId(sender), payload),
  ABORT_MAKERWORLD_COLLECTION_JOB: (_payload, sender) => abortJob(senderTabId(sender)),
  FORCE_ADVANCE_MAKERWORLD_JOB: (_payload, sender) => forceAdvanceJob(senderTabId(sender)),
  ARM_DOWNLOAD_CAPTURE: (_payload, sender) => {
    requireProviderPage(sender);
    return armDownloadCapture();
  },
  AWAIT_DOWNLOAD_CAPTURE: (_payload, sender) => {
    requireProviderPage(sender);
    return awaitDownloadCapture();
  },
  RESOLVE_CULTS3D_FILE: ({ url }, sender) => {
    requireProviderPage(sender);
    return resolveCults3dFileLink(url);
  },
  GET_MAKERWORLD_JOB: (_payload, sender) => getJobForTab(sender.tab?.id),
});

// Clear the plain-text password and session token that versions before 1.3 stored.
void purgeLegacyCredentials();
chrome.runtime.onInstalled.addListener(() => void purgeLegacyCredentials());

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Per-tab icon overrides persist, so reset on every new navigation; the content script re-asserts it.
  if (changeInfo.status === "loading") void setTabIconState(tabId, false);
  // "complete" wakes a suspended background to drive the guided import.
  if (changeInfo.status === "complete") void advanceJob(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void dropJobIfForTab(tabId);
});

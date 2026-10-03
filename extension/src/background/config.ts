import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  apiUrl,
  instanceUrlProblem,
  isApiToken,
  normalizeInstanceUrl,
  type StoredConfig,
} from "../shared/storage";
import type { ExtensionState } from "../shared/messages";

export async function getStoredConfig(): Promise<StoredConfig> {
  return chrome.storage.local.get(Object.values(STORAGE_KEYS)) as Promise<StoredConfig>;
}

export type ConfiguredConfig = StoredConfig & { instanceUrl: string; token: string };

export function isConfigured(config: StoredConfig): config is ConfiguredConfig {
  return Boolean(config.instanceUrl && isApiToken(config.token));
}

export async function getState(): Promise<ExtensionState> {
  const config = await getStoredConfig();
  return {
    configured: isConfigured(config),
    disabled: Boolean(config.disabled),
    instanceUrl: config.instanceUrl || "",
    account: config.accountName || config.accountEmail || "",
    tokenRejected: Boolean(config.tokenRejected),
    shareMakerworldSession: config.shareMakerworldSession !== false,
  };
}

/** Versions before 1.3 stored the account password (and a session token) in plain text. Clear them,
 *  so upgrading doesn't leave the password sitting in extension storage. The instance URL is kept so
 *  the user only has to paste a token. */
export async function purgeLegacyCredentials(): Promise<void> {
  const stored = await chrome.storage.local.get([...LEGACY_STORAGE_KEYS, STORAGE_KEYS.token]);
  const stale: string[] = LEGACY_STORAGE_KEYS.filter((key) => key in stored);
  // The old "token" was a short-lived session JWT; only an API token belongs under this key now.
  if (typeof stored.token === "string" && !isApiToken(stored.token)) stale.push(STORAGE_KEYS.token);
  if (stale.length) await chrome.storage.local.remove(stale);
}

type TokenInfo = { name: string; user: { display_name: string; email: string } };

/** Asks the instance who the token belongs to, which also proves the token and address work. */
async function fetchTokenInfo(instanceUrl: string, token: string): Promise<TokenInfo> {
  let res: Response;
  try {
    res = await fetch(apiUrl(instanceUrl, "/token/self"), {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
    });
  } catch {
    throw new Error(
      "Couldn't reach this Thingport instance. Check the address, and that it isn't redirecting to another URL.",
    );
  }
  if (res.status === 401) {
    throw new Error("Thingport didn't accept this token. It may be mistyped, revoked or expired.");
  }
  if (res.status === 404) {
    throw new Error("This instance doesn't support API tokens yet. Update Thingport to a version that does.");
  }
  if (!res.ok) throw new Error(`Thingport answered ${res.status}. Check the instance URL.`);
  return (await res.json()) as TokenInfo;
}

// The popup requests the host permission itself: it needs the submit's user gesture.
export async function saveConfig({ instanceUrl, token }: { instanceUrl: string; token: string }): Promise<null> {
  const problem = instanceUrlProblem(instanceUrl);
  if (problem) throw new Error(problem);
  const trimmed = (token || "").trim();
  if (!isApiToken(trimmed)) {
    throw new Error(
      "That doesn't look like a Thingport API token (they start with tpg_). Create one in Thingport under Profile → API tokens.",
    );
  }
  const normalized = normalizeInstanceUrl(instanceUrl);
  // Validate before persisting.
  const info = await fetchTokenInfo(normalized, trimmed);
  await chrome.storage.local.set({
    instanceUrl: normalized,
    token: trimmed,
    accountName: info.user.display_name,
    accountEmail: info.user.email,
    disabled: false,
    tokenRejected: false,
  });
  await purgeLegacyCredentials();
  return null;
}

export async function setDisabled(disabled: boolean): Promise<null> {
  await chrome.storage.local.set({ disabled: Boolean(disabled) });
  return null;
}

export async function setShareMakerworldSession(share: boolean): Promise<null> {
  await chrome.storage.local.set({ shareMakerworldSession: Boolean(share) });
  return null;
}

/** Forgets the instance, token and everything derived from them (including the recent-imports strip,
 *  which holds thumbnails of the user's models). */
export async function disconnect(): Promise<null> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.instanceUrl,
    STORAGE_KEYS.token,
    STORAGE_KEYS.accountName,
    STORAGE_KEYS.accountEmail,
    STORAGE_KEYS.tokenRejected,
    STORAGE_KEYS.lastSyncedMakerworldCookie,
    "recentImports",
  ]);
  return null;
}

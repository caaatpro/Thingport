// chrome.storage.local keys and their shapes. Nothing is synced across browsers.

export const STORAGE_KEYS = {
  instanceUrl: "instanceUrl",
  // A Thingport API token ("tpg_..."): scoped to what this extension needs and revocable from the
  // Thingport profile page, so the account password is never asked for or stored.
  token: "token",
  accountName: "accountName",
  accountEmail: "accountEmail",
  disabled: "disabled",
  // Set when Thingport answered 401: the token was revoked or has expired, so the user must reconnect.
  tokenRejected: "tokenRejected",
  // Whether to forward the browser's MakerWorld session cookie to the instance. Defaults to on.
  shareMakerworldSession: "shareMakerworldSession",
  // Lets the cookie sync skip a redundant PATCH.
  lastSyncedMakerworldCookie: "lastSyncedMakerworldCookie",
} as const;

/** Keys older versions wrote, notably the plain-text password. Removed on startup. */
export const LEGACY_STORAGE_KEYS = ["email", "password", "tokenExpiresAt"] as const;

export type StoredConfig = {
  instanceUrl?: string;
  token?: string;
  accountName?: string;
  accountEmail?: string;
  disabled?: boolean;
  tokenRejected?: boolean;
  shareMakerworldSession?: boolean;
  lastSyncedMakerworldCookie?: string;
};

export const CONFIG_CHANGE_KEYS: readonly string[] = [
  STORAGE_KEYS.instanceUrl,
  STORAGE_KEYS.token,
  STORAGE_KEYS.disabled,
];

export function normalizeInstanceUrl(raw: string | undefined | null): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

export function apiUrl(instanceUrl: string, path: string): string {
  return `${normalizeInstanceUrl(instanceUrl)}/api${path}`;
}

/** The shape of a token Thingport issues: "tpg_" plus a long random string. */
export function isApiToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^tpg_[A-Za-z0-9_-]{20,200}$/.test(value);
}

/** Loopback, private-network, link-local and single-label (e.g. "nas") hosts, where plain http stays
 *  on the user's own network. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(localhost|local|lan|internal|home\.arpa)$/.test(host)) return true;
  if (!host.includes(".") && !host.includes(":")) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT range, e.g. Tailscale
    );
  }
  if (host.includes(":")) return host === "::1" || /^f[cd]/.test(host) || host.startsWith("fe80:");
  return false;
}

/** Null when the address is acceptable, otherwise what to tell the user. The token and the
 *  MakerWorld session are sent to this address, so plain http is only allowed on a private network. */
export function instanceUrlProblem(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(normalizeInstanceUrl(raw));
  } catch {
    return "Enter a valid instance URL, e.g. https://thingport.example.com";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "The instance URL must start with https://";
  }
  if (parsed.username || parsed.password) {
    return "Remove the username and password from the instance URL.";
  }
  if (parsed.protocol === "http:" && !isPrivateHost(parsed.hostname)) {
    return "Use https:// for this address. Plain http is only allowed for localhost and private-network addresses, because your token would otherwise cross the internet unencrypted.";
  }
  return null;
}

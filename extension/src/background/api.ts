// Every fetch to the Thingport instance goes through here, so auth and the instance URL live in one
// place. The host permission granted at setup bypasses CORS. Requests carry an API token, never the
// account password, and are restricted to the endpoints in shared/apiPolicy.ts.

import { isApiCallAllowed } from "../shared/apiPolicy";
import { apiUrl, STORAGE_KEYS } from "../shared/storage";
import { isMakerworldUrl } from "../shared/urls";
import { getStoredConfig, isConfigured, type ConfiguredConfig } from "./config";
import { getLiveMakerworldCookie, maybeSyncMakerworldCookie } from "./makerworldCookie";

async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string } | null;
    if (body && body.detail) return body.detail;
  } catch {}
  return fallback;
}

export async function requireConfig(): Promise<ConfiguredConfig> {
  const config = await getStoredConfig();
  if (!isConfigured(config)) throw new Error("Thingport Grab isn't configured yet -- open the extension popup first.");
  if (config.disabled) throw new Error("Thingport Grab is disabled -- re-enable it from the extension popup.");
  return config;
}

const TOKEN_REJECTED_MESSAGE =
  "Thingport rejected this extension's API token -- it was revoked or has expired. Open the extension and connect with a new token.";

async function send(config: ConfiguredConfig, method: string, path: string, body?: unknown): Promise<Response> {
  if (!isApiCallAllowed(method, path)) {
    throw new Error(`Thingport Grab doesn't use ${method} ${path.split("?")[0]}, so the request was blocked.`);
  }
  const res = await fetch(apiUrl(config.instanceUrl, path), {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // A redirect would re-send the token to wherever it points.
    redirect: "error",
  });
  if (res.status === 401) {
    await chrome.storage.local.set({ [STORAGE_KEYS.tokenRejected]: true });
    throw new Error(TOKEN_REJECTED_MESSAGE);
  }
  return res;
}

/** `path` is after `/api`. MakerWorld `/import*` calls get the live browser cookie attached unless
 *  the caller set one, or the user turned session sharing off. */
export async function apiCall<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const config = await requireConfig();

  let finalBody = body as Record<string, unknown> | undefined;
  if (
    config.shareMakerworldSession !== false &&
    path.startsWith("/import") &&
    finalBody &&
    !finalBody.makerworld_cookie &&
    isMakerworldUrl(finalBody.url as string)
  ) {
    const liveCookie = await getLiveMakerworldCookie();
    if (liveCookie) {
      finalBody = { ...finalBody, makerworld_cookie: liveCookie };
      void maybeSyncMakerworldCookie(config, liveCookie);
    }
  }

  const res = await send(config, method, path, finalBody);
  if (!res.ok) throw new Error(await errorDetail(res, `Request failed (${res.status})`));
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function apiFetchBlob(config: ConfiguredConfig, path: string): Promise<Blob | null> {
  const res = await send(config, "GET", path);
  return res.ok ? res.blob() : null;
}

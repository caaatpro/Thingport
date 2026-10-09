import { IMPORT_BROWSER_USER_AGENT, IMPORT_TIMEOUT_SECONDS } from "../../../config";

// The one place the provider clients take their HTTP defaults from.

export const PROVIDER_TIMEOUT_MS = IMPORT_TIMEOUT_SECONDS * 1000;

/** Provider APIs sit behind Cloudflare and answer a bare client UA with a challenge, so they get a browser UA. */
export function providerHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "User-Agent": IMPORT_BROWSER_USER_AGENT, ...extra };
}

/**
 * Runs `request` with an abort signal that fires after `ms`. The timer covers everything `request` awaits,
 * so read the body inside it when a stalled body must time out too.
 */
export async function withTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  ms: number = PROVIDER_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

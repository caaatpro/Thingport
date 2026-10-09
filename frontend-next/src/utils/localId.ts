/**
 * A throwaway, non-cryptographic id for keying unsaved items while a form is open.
 *
 * `crypto.randomUUID()` only exists in a secure context (HTTPS, or http on localhost), so it is
 * `undefined` when the app is served over plain HTTP on a LAN IP (e.g. http://192.168.x.x). Calling
 * it there throws "crypto.randomUUID is not a function", which broke file selection in the edit
 * dialog. Fall back to `getRandomValues`, then to `Math.random`, which are all fine for a key that
 * never leaves the browser.
 */
export function localId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  if (typeof c?.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

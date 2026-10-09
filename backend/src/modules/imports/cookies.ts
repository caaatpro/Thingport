import { MAKERWORLD_COOKIE } from "../../config";
import { getUserMakerworldCookie } from "./providers/makerworld/cookie";
import type { ImportCookies } from "./types";

function firstNonEmptyLine(raw: string): string | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  let value = lines[0];
  for (const line of lines) {
    if (line.toLowerCase().startsWith("cookie:")) {
      value = line.slice("cookie:".length).trim();
      break;
    }
  }
  return value || null;
}

/** The cookie from the request, else the instance-wide one. Accepts a pasted `Cookie:` header line. */
export function resolveMakerworldCookie(body: ImportCookies): string | null {
  const raw = (body.makerworld_cookie || MAKERWORLD_COOKIE).trim();
  if (!raw) return null;
  return firstNonEmptyLine(raw);
}

/** Falls back to the cookie saved in Settings when the request doesn't carry one. */
export async function withStoredMakerworldCookie<T extends ImportCookies>(userId: string, body: T): Promise<T> {
  if (body.makerworld_cookie && body.makerworld_cookie.trim()) return body;
  const stored = await getUserMakerworldCookie(userId);
  return stored ? { ...body, makerworld_cookie: stored } : body;
}

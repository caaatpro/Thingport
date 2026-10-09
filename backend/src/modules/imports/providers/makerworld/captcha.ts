import { isRecord } from "../parse";

// MakerWorld's anti-abuse layer (separate from Cloudflare) answers a flagged request with a JSON
// body naming a captchaId, under either HTTP 418 or 200. It can't be solved without a real
// browser, so it's detected by shape and reported instead of surfacing as "no file found".
// The cloud API and collection listing share one cooldown so one can't re-trip the other.
export function isCaptchaChallenge(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const haystack = Object.entries(data)
    .map(([key, value]) => `${key} ${typeof value === "string" ? value : ""}`)
    .join(" ")
    .toLowerCase();
  return haystack.includes("captchaid") || haystack.includes("captcha") || haystack.includes("robot");
}

export const MAKERWORLD_CAPTCHA_MESSAGE =
  "MakerWorld is challenging this account with a CAPTCHA before it will hand over a download link. " +
  "This can't be solved automatically. Open the model on makerworld.com and click Download there " +
  "once -- that usually clears it -- then retry the import.";

// The block is IP-scoped and clears on its own after 1-4 hours; retrying into it extends it.
// The cooloff only needs to stop a batch import hammering a known block, so 2h is enough.
const CAPTCHA_COOLOFF_MS = 2 * 60 * 60 * 1000;
let captchaBlockedUntil = 0;

export function makerworldCaptchaCooloffActive(): boolean {
  return Date.now() < captchaBlockedUntil;
}

export class MakerworldCaptchaError extends Error {
  constructor() {
    super(MAKERWORLD_CAPTCHA_MESSAGE);
    this.name = "MakerworldCaptchaError";
  }
}

export class MakerworldAuthError extends Error {
  constructor() {
    super("Your MakerWorld session has expired or was rejected. Update the cookie in Settings and try again.");
    this.name = "MakerworldAuthError";
  }
}

/** Starts the cooloff and throws when `data` is the CAPTCHA challenge. */
export function throwIfCaptcha(data: unknown): void {
  if (!isCaptchaChallenge(data)) return;
  captchaBlockedUntil = Date.now() + CAPTCHA_COOLOFF_MS;
  throw new MakerworldCaptchaError();
}

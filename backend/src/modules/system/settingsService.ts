import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";

// Instance-wide settings: one key/value row each in the Setting table. A missing or malformed row reads as
// the default, never as an error.

async function readSetting(key: string): Promise<Prisma.JsonValue | undefined> {
  return (await prisma.setting.findUnique({ where: { key } }))?.value;
}

async function writeSetting(key: string, value: Prisma.InputJsonValue): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const value = await readSetting(key);
  return typeof value === "boolean" ? value : fallback;
}

const ALLOW_REGISTRATIONS_KEY = "allow_registrations";

export async function getAllowRegistrations(fallback: boolean): Promise<boolean> {
  return getBoolSetting(ALLOW_REGISTRATIONS_KEY, fallback);
}

export async function setAllowRegistrations(value: boolean): Promise<void> {
  await writeSetting(ALLOW_REGISTRATIONS_KEY, value);
}

const SIMPLIFY_PREVIEWS_KEY = "simplify_previews";

export async function getSimplifyPreviews(): Promise<boolean> {
  return getBoolSetting(SIMPLIFY_PREVIEWS_KEY, false);
}

export async function setSimplifyPreviews(value: boolean): Promise<void> {
  await writeSetting(SIMPLIFY_PREVIEWS_KEY, value);
}

export type PreviewMode = "automatic" | "on-demand" | "disabled";
const PREVIEW_MODES = new Set<PreviewMode>(["automatic", "on-demand", "disabled"]);
const PREVIEW_MODE_KEY = "preview_mode";
const DEFAULT_PREVIEW_MODE: PreviewMode = "automatic";

// Instance-wide: every user's previews share the same storage.
export async function getPreviewMode(): Promise<PreviewMode> {
  const value = await readSetting(PREVIEW_MODE_KEY);
  return typeof value === "string" && PREVIEW_MODES.has(value as PreviewMode)
    ? (value as PreviewMode)
    : DEFAULT_PREVIEW_MODE;
}

export async function setPreviewMode(value: PreviewMode): Promise<void> {
  await writeSetting(PREVIEW_MODE_KEY, value);
}

const THINGIVERSE_ACCESS_TOKEN_KEY = "thingiverse_access_token";

// Instance-wide: the token belongs to whichever Thingiverse account registered the app.
export async function getThingiverseAccessToken(): Promise<string | null> {
  const value = await readSetting(THINGIVERSE_ACCESS_TOKEN_KEY);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function setThingiverseAccessToken(value: string | null): Promise<void> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    await prisma.setting.deleteMany({ where: { key: THINGIVERSE_ACCESS_TOKEN_KEY } });
    return;
  }
  await writeSetting(THINGIVERSE_ACCESS_TOKEN_KEY, trimmed);
}

export type SmtpSettings = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
};

const SMTP_SETTINGS_KEY = "smtp_settings";
const DEFAULT_SMTP_FROM = "Thingport <no-reply@localhost>";

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Seeds from SMTP_* env vars until an admin saves settings; then the DB row wins.
function smtpSeedFromEnv(): SmtpSettings {
  return {
    host: (process.env.SMTP_HOST || "").trim() || null,
    port: envInt("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: (process.env.SMTP_USER || "").trim() || null,
    pass: (process.env.SMTP_PASS || "").trim() || null,
    from: (process.env.SMTP_FROM || "").trim() || DEFAULT_SMTP_FROM,
  };
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const stored = await readSetting(SMTP_SETTINGS_KEY);
  if (typeof stored === "object" && stored !== null && !Array.isArray(stored)) {
    return { ...smtpSeedFromEnv(), ...(stored as Partial<SmtpSettings>) };
  }
  return smtpSeedFromEnv();
}

export async function isSmtpConfigured(): Promise<boolean> {
  return Boolean((await getSmtpSettings()).host);
}

export async function setSmtpSettings(patch: Partial<SmtpSettings>): Promise<SmtpSettings> {
  const next = { ...(await getSmtpSettings()), ...patch };
  await writeSetting(SMTP_SETTINGS_KEY, next as unknown as Prisma.InputJsonValue);
  return next;
}

const AUTH_TOKEN_TTL_KEY = "auth_token_ttl_seconds";
const DEFAULT_AUTH_TOKEN_TTL_SECONDS = 43200;

// Seeds from AUTH_TOKEN_TTL until an admin saves a value. Only affects newly issued tokens.
export async function getAuthTokenTtl(): Promise<number> {
  const value = await readSetting(AUTH_TOKEN_TTL_KEY);
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  return envInt("AUTH_TOKEN_TTL", DEFAULT_AUTH_TOKEN_TTL_SECONDS);
}

export async function setAuthTokenTtl(seconds: number): Promise<void> {
  await writeSetting(AUTH_TOKEN_TTL_KEY, seconds);
}

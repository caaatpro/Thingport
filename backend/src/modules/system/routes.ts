import type { Router } from "express";
import { HttpError } from "../../http/errors";
import { createRouter } from "../../http/route";
import { prisma } from "../../db";
import { logger } from "../../lib/logger";
import { type MakerworldCookieCheck, verifyMakerworldCookie } from "../imports/providers/makerworld/cloudApi";
import { getUserMakerworldCookie, setUserMakerworldCookie } from "../imports/providers/makerworld/cookie";
import { dropPreviewsAffectedBySimplification } from "../processing/index";
import {
  DEFAULT_STORAGE_TEMPLATE,
  STORAGE_TEMPLATE_TOKENS,
  getStorageTemplate,
  reorganizeManagedPrints,
  samplePlateStoragePaths,
  setStorageTemplate,
  validateStorageTemplate,
} from "../prints/index";
import { verifyThingiverseAccessToken } from "../imports/providers/thingiverse";
import { getDatabaseInfo, testAndSwitchDatabase } from "./databaseSettings";
import { toNotificationOut } from "./dto";
import { listNotifications, markAllRead } from "./notifications";
import {
  getUserAuthorPreviewEnabled,
  getUserSlicer,
  getUserTheme,
  setUserAuthorPreviewEnabled,
  setUserSlicer,
  setUserTheme,
} from "./preferences";
import {
  authorPreviewSettingsSchema,
  authSettingsSchema,
  databaseSettingsSchema,
  makerworldSettingsSchema,
  previewsSchema,
  registrationsSchema,
  renderingSchema,
  slicerSettingsSchema,
  smtpSettingsSchema,
  storageSettingsSchema,
  themeSettingsSchema,
  thingiverseSettingsSchema,
} from "./schemas";
import {
  getAllowRegistrations,
  getAuthTokenTtl,
  getPreviewMode,
  getSimplifyPreviews,
  getSmtpSettings,
  getThingiverseAccessToken,
  isSmtpConfigured,
  setAllowRegistrations,
  setAuthTokenTtl,
  setPreviewMode,
  setSimplifyPreviews,
  setSmtpSettings,
  setThingiverseAccessToken,
  type SmtpSettings,
} from "./settingsService";

// --- Health (public) --------------------------------------------------------------------------------

const health = createRouter();

health.get("/health", { access: "public" }, async () => {
  // The first admin can always register, whatever the setting says.
  const bootstrapping = (await prisma.user.count({ where: { role: "ADMIN" } })) === 0;
  return {
    ok: true,
    auth_required: true,
    allow_registrations: bootstrapping || (await getAllowRegistrations(true)),
    // The reset link is emailed, so the sign-in form only offers it with SMTP set up.
    password_reset_enabled: await isSmtpConfigured(),
  };
});

// --- Settings ---------------------------------------------------------------------------------------
// Instance-wide settings are admin-only to change; a few are readable by every user so the UI can adapt.
// The per-user ones (MakerWorld cookie, slicer, theme, author preview) are open to any signed-in user.

const settings = createRouter();

function storageSettingsOut(template: string, moved = 0, skipped = 0) {
  return {
    template,
    default_template: DEFAULT_STORAGE_TEMPLATE,
    allowed_tokens: [...STORAGE_TEMPLATE_TOKENS],
    plate_paths: samplePlateStoragePaths(template),
    moved,
    skipped,
  };
}

settings.get("/settings/storage", { access: "admin" }, async () =>
  storageSettingsOut(validateStorageTemplate(await getStorageTemplate())),
);

// Admin-only: "apply to existing" relocates every user's files.
settings.post("/settings/storage", { access: "admin", body: storageSettingsSchema }, async ({ body }) => {
  const template = validateStorageTemplate(body.template);
  await setStorageTemplate(template);
  const { moved, skipped } = body.apply_existing ? await reorganizeManagedPrints(template) : { moved: 0, skipped: 0 };
  return storageSettingsOut(template, moved, skipped);
});

settings.get("/settings/registrations", async () => ({ allow_registrations: await getAllowRegistrations(true) }));

// Closed registrations still admit invitees and the very first account.
settings.post("/settings/registrations", { access: "admin", body: registrationsSchema }, async ({ body }) => {
  await setAllowRegistrations(body.allow_registrations);
  return { allow_registrations: body.allow_registrations };
});

settings.get("/settings/auth", { access: "admin" }, async () => ({ token_ttl_seconds: await getAuthTokenTtl() }));

settings.patch("/settings/auth", { access: "admin", body: authSettingsSchema }, async ({ body }) => {
  await setAuthTokenTtl(body.token_ttl_seconds);
  return { token_ttl_seconds: body.token_ttl_seconds };
});

settings.get("/settings/previews", async () => ({ mode: await getPreviewMode() }));

settings.post("/settings/previews", { access: "admin", body: previewsSchema }, async ({ body }) => {
  await setPreviewMode(body.mode);
  return { mode: body.mode };
});

settings.get("/settings/rendering", { access: "admin" }, async () => ({
  simplify_previews: await getSimplifyPreviews(),
}));

// A change drops the cached previews it would alter, in the background.
settings.patch("/settings/rendering", { access: "admin", body: renderingSchema }, async ({ body }) => {
  const previous = await getSimplifyPreviews();
  await setSimplifyPreviews(body.simplify_previews);
  if (previous !== body.simplify_previews) {
    void dropPreviewsAffectedBySimplification(body.simplify_previews).catch((err) =>
      logger.error("Couldn't refresh previews after a simplification change", { error: err }),
    );
  }
  return { simplify_previews: body.simplify_previews };
});

// Readable by every user so the UI can tell whether imports will work. GET never echoes the
// token, only whether one is set.
settings.get("/settings/thingiverse", async () => ({ configured: Boolean(await getThingiverseAccessToken()) }));

settings.post("/settings/thingiverse", { access: "admin", body: thingiverseSettingsSchema }, async ({ body }) => {
  const trimmed = (body.access_token ?? "").trim();
  if (trimmed && !(await verifyThingiverseAccessToken(trimmed))) {
    throw new HttpError(
      422,
      "Couldn't verify this Thingiverse Access Token -- it may be invalid, revoked, or Thingiverse is rate-limiting this instance right now. Double-check the token at thingiverse.com/apps/create and try again.",
    );
  }
  await setThingiverseAccessToken(body.access_token);
  return { configured: Boolean(trimmed) };
});

function smtpSettingsOut(smtp: SmtpSettings) {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    user: smtp.user,
    from: smtp.from,
    configured: Boolean(smtp.host),
  };
}

settings.get("/settings/smtp", { access: "admin" }, async () => smtpSettingsOut(await getSmtpSettings()));

settings.patch("/settings/smtp", { access: "admin", body: smtpSettingsSchema }, async ({ body }) => {
  const patch: Partial<SmtpSettings> = {};
  if (body.host !== undefined) patch.host = body.host?.trim() || null;
  if (body.port !== undefined) patch.port = body.port;
  if (body.secure !== undefined) patch.secure = body.secure;
  if (body.user !== undefined) patch.user = body.user?.trim() || null;
  if (body.pass !== undefined) patch.pass = body.pass?.trim() || null;
  if (body.from?.trim()) patch.from = body.from.trim();
  return smtpSettingsOut(await setSmtpSettings(patch));
});

settings.get("/settings/database", { access: "admin" }, () => getDatabaseInfo());

// Tests the credentials before hot-swapping the live connection. Not persisted across restarts
// (see databaseSettings.ts); host/port can't change.
settings.post("/settings/database", { access: "admin", body: databaseSettingsSchema }, async ({ body }) => {
  try {
    return await testAndSwitchDatabase(body);
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : "Failed to connect to that database.");
  }
});

// Per-user, unlike the instance-wide Thingiverse token. GET only reports whether one is set.
settings.get("/settings/makerworld", async ({ userId }) => ({
  configured: Boolean(await getUserMakerworldCookie(userId)),
}));

const MAKERWORLD_UNVERIFIABLE_MESSAGES: Record<
  Extract<MakerworldCookieCheck, { result: "unverifiable" }>["reason"],
  string
> = {
  cloudflare_no_flaresolverr:
    "Couldn't check this cookie: MakerWorld's Cloudflare protection blocked the request and FlareSolverr isn't configured. Set FLARESOLVERR_URL and try again.",
  flaresolverr_failed:
    "Couldn't check this cookie: MakerWorld's Cloudflare protection blocked the request and FlareSolverr didn't get past it. Make sure FlareSolverr is running and reachable at FLARESOLVERR_URL, then try again.",
  network:
    "Couldn't check this cookie: MakerWorld didn't respond. Check this server's internet connection and try again.",
};

settings.patch("/settings/makerworld", { body: makerworldSettingsSchema }, async ({ body, userId }) => {
  const trimmed = (body.cookie ?? "").trim();
  if (body.verify && trimmed) {
    const check = await verifyMakerworldCookie(trimmed);
    if (check.result === "invalid") {
      throw new HttpError(
        422,
        "MakerWorld rejected this cookie -- it may be invalid or expired. Copy a fresh Cookie header from a logged-in makerworld.com tab and try again.",
      );
    }
    // 503, not 422: nothing is known to be wrong with the cookie.
    if (check.result === "unverifiable") throw new HttpError(503, MAKERWORLD_UNVERIFIABLE_MESSAGES[check.reason]);
  }
  return { configured: await setUserMakerworldCookie(userId, body.cookie) };
});

settings.get("/settings/slicer", async ({ userId }) => ({ slicer: await getUserSlicer(userId) }));

settings.patch("/settings/slicer", { body: slicerSettingsSchema }, async ({ body, userId }) => ({
  slicer: await setUserSlicer(userId, body.slicer),
}));

// Null means never set; the frontend applies its default.
settings.get("/settings/theme", async ({ userId }) => ({ theme: await getUserTheme(userId) }));

settings.patch("/settings/theme", { body: themeSettingsSchema }, async ({ body, userId }) => ({
  theme: await setUserTheme(userId, body.theme),
}));

settings.get("/settings/author-preview", async ({ userId }) => ({
  enabled: await getUserAuthorPreviewEnabled(userId),
}));

settings.patch("/settings/author-preview", { body: authorPreviewSettingsSchema }, async ({ body, userId }) => ({
  enabled: await setUserAuthorPreviewEnabled(userId, body.enabled),
}));

// --- Notifications ----------------------------------------------------------------------------------

const notifications = createRouter();

notifications.get("/notifications", async ({ userId }) => {
  const { items, unreadCount } = await listNotifications(userId);
  return { items: items.map(toNotificationOut), unread_count: unreadCount };
});

notifications.post("/notifications/read-all", async ({ userId }) => {
  await markAllRead(userId);
  return { ok: true };
});

/** Public; no auth, so it can be mounted anywhere in the order. */
export const publicRouters: Router[] = [health.router];
export const routers: Router[] = [settings.router, notifications.router];

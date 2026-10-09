import { z } from "zod";
import { SLICER_IDS, THEME_SELECTIONS } from "./preferences";

// Bounds catch typos. Only affects tokens issued after saving.
const MIN_AUTH_TOKEN_TTL_SECONDS = 5 * 60;
const MAX_AUTH_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

export const storageSettingsSchema = z.object({ template: z.string(), apply_existing: z.boolean().default(false) });
export const registrationsSchema = z.object({ allow_registrations: z.boolean() });
export const authSettingsSchema = z.object({
  token_ttl_seconds: z.number().int().min(MIN_AUTH_TOKEN_TTL_SECONDS).max(MAX_AUTH_TOKEN_TTL_SECONDS),
});
export const previewsSchema = z.object({ mode: z.enum(["automatic", "on-demand", "disabled"]) });
export const renderingSchema = z.object({ simplify_previews: z.boolean() });
export const thingiverseSettingsSchema = z.object({ access_token: z.string().nullable() });
export const smtpSettingsSchema = z.object({
  host: z.string().nullable().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().nullable().optional(),
  // Omitted means keep the current password.
  pass: z.string().nullable().optional(),
  from: z.string().optional(),
});
export const databaseSettingsSchema = z.object({
  database: z.string().trim().min(1, "Database name is required"),
  user: z.string().trim().min(1, "User is required"),
  password: z.string().min(1, "Password is required"),
});
// `verify` is opt-in: the extension's background sync sends a cookie it already knows works.
export const makerworldSettingsSchema = z.object({ cookie: z.string().nullable(), verify: z.boolean().optional() });
export const slicerSettingsSchema = z.object({ slicer: z.enum(SLICER_IDS).nullable() });
export const themeSettingsSchema = z.object({ theme: z.enum(THEME_SELECTIONS).nullable() });
export const authorPreviewSettingsSchema = z.object({ enabled: z.boolean() });

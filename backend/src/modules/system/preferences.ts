import { prisma } from "../../db";

// Per-user display preferences stored on the user row. Unknown stored values read back as "never set".

// Kept in sync by hand with the frontend's ThemeSelection.
export const THEME_SELECTIONS = ["light", "dark", "system"] as const;
export type ThemeSelection = (typeof THEME_SELECTIONS)[number];

function isThemeSelection(value: string): value is ThemeSelection {
  return (THEME_SELECTIONS as readonly string[]).includes(value);
}

export async function getUserTheme(userId: string): Promise<ThemeSelection | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { themePreference: true } });
  const value = user?.themePreference;
  return value && isThemeSelection(value) ? value : null;
}

export async function setUserTheme(userId: string, theme: string | null): Promise<ThemeSelection | null> {
  const next = theme && isThemeSelection(theme) ? theme : null;
  await prisma.user.update({ where: { id: userId }, data: { themePreference: next } });
  return next;
}

// The slicers a model can be opened in, by the URL scheme each registers. Anything else is "other".
export const SLICER_IDS = [
  "bambustudio",
  "orcaslicer",
  "prusaslicer",
  "cura",
  "crealityprintlink",
  "anycubicslicernext",
  "elegooslicer",
  "snapmaker-orca",
  "other",
] as const;
export type SlicerId = (typeof SLICER_IDS)[number];

function isSlicerId(value: string): value is SlicerId {
  return (SLICER_IDS as readonly string[]).includes(value);
}

export async function getUserSlicer(userId: string): Promise<SlicerId | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { slicer: true } });
  const value = user?.slicer;
  return value && isSlicerId(value) ? value : null;
}

export async function setUserSlicer(userId: string, slicer: string | null): Promise<SlicerId | null> {
  const next = slicer && isSlicerId(slicer) ? slicer : null;
  await prisma.user.update({ where: { id: userId }, data: { slicer: next } });
  return next;
}

/** On by default: the author-preview toggle only exists to switch it off. */
export async function getUserAuthorPreviewEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { authorPreviewEnabled: true } });
  return user?.authorPreviewEnabled ?? true;
}

export async function setUserAuthorPreviewEnabled(userId: string, enabled: boolean): Promise<boolean> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { authorPreviewEnabled: enabled },
    select: { authorPreviewEnabled: true },
  });
  return user.authorPreviewEnabled;
}

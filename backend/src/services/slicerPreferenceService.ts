import { prisma } from "../db";

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

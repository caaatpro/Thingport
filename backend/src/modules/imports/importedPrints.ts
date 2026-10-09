import { prisma } from "../../db";
import type { Plate, PreviewImage } from "../../generated/prisma/client";
import { parseMakerworldModelUrl } from "./providers/makerworld/urls";
import { identifySourceModel, type SourceModel } from "./sourceLinks";
import type { ImportedPrint } from "./types";

/** `state` refines already_imported for a MakerWorld URL naming a profile: "profile_missing"
 *  when every plate is a different profile, "profile_unknown" when some plates predate profile
 *  tracking. already_imported stays for older extension versions. */
export type ImportStatus = {
  recognized: boolean;
  already_imported: boolean;
  print_id: string | null;
  state: "not_imported" | "imported" | "profile_missing" | "profile_unknown";
};

/** Never fetches the provider's page, so it's cheap enough for the extension to call on every
 * page load. */
export async function checkImportStatus(userId: string, url: string): Promise<ImportStatus> {
  const source = identifySourceModel(url);
  if (!source) return { recognized: false, already_imported: false, print_id: null, state: "not_imported" };
  const print = await prisma.print.findFirst({
    where: { userId, sourceProvider: source.provider, sourceExternalId: source.externalId },
    select: { id: true, plates: { select: { sourceInstanceId: true } } },
  });
  if (!print) return { recognized: true, already_imported: false, print_id: null, state: "not_imported" };
  // Without a profile in the URL, any imported profile counts; asking MakerWorld on every page
  // view isn't worth it.
  const requestedInstanceId =
    source.provider === "makerworld" ? parseMakerworldModelUrl(url)?.requestedInstanceId : null;
  if (requestedInstanceId && !print.plates.some((plate) => plate.sourceInstanceId === requestedInstanceId)) {
    const state = print.plates.some((plate) => plate.sourceInstanceId == null) ? "profile_unknown" : "profile_missing";
    return { recognized: true, already_imported: false, print_id: print.id, state };
  }
  return { recognized: true, already_imported: true, print_id: print.id, state: "imported" };
}

export type ExistingImportedPrint = Omit<ImportedPrint, "alreadyImported" | "profileAdded">;

/** The user's print for this source model, if they have imported it before: the basis of "a model you
 * already have is never imported twice". */
export async function findExistingImportedPrint(
  userId: string,
  source: SourceModel,
): Promise<ExistingImportedPrint | null> {
  const print = await prisma.print.findFirst({
    where: { userId, sourceProvider: source.provider, sourceExternalId: source.externalId },
    include: { author: true },
  });
  if (!print) return null;
  const [plates, previewImages] = await Promise.all([platesOf(print.id), previewImagesOf(print.id)]);
  return { print, plates, author: print.author, previewImages };
}

export function platesOf(printId: string): Promise<Plate[]> {
  return prisma.plate.findMany({ where: { printId }, orderBy: { position: "asc" } });
}

export function previewImagesOf(printId: string): Promise<PreviewImage[]> {
  return prisma.previewImage.findMany({ where: { printId }, orderBy: { position: "asc" } });
}

/** Bulk version of the dedup lookup, for flagging already-imported entries in a listing. */
export async function findImportedExternalIds(
  userId: string,
  provider: string,
  externalIds: string[],
): Promise<Set<string>> {
  if (!externalIds.length) return new Set();
  const prints = await prisma.print.findMany({
    where: { userId, sourceProvider: provider, sourceExternalId: { in: externalIds } },
    select: { sourceExternalId: true },
  });
  return new Set(prints.map((p) => p.sourceExternalId).filter((id): id is string => id !== null));
}

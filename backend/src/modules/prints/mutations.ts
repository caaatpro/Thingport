import fs from "node:fs/promises";
import { prisma } from "../../db";
import { forbidden, notFound, badRequest } from "../../http/errors";
import type { Prisma } from "../../generated/prisma/client";
import { normalizeTags } from "../../utils/tagNormalization";
import { createLog } from "../../services/auditLog";
import { deleteAuthorIfOrphaned } from "../../services/authorService";
import { printWriteWhere } from "./access";
import type { PrintOut } from "./dto";
import { requireOwnedPrint, requireWritablePrint } from "./lookup";
import { uniqueModelName } from "./naming";
import { plateThumbPath } from "./plateThumbnails";
import { deletePlateFiles } from "./printCreation";
import { deleteAllPrintFiles } from "./printFiles";
import { loadFullPrint, printOutById } from "./printLoader";
import { deleteAllPreviewImages } from "./previewImages";
import { relocatePrint, relocatePrintsForToken } from "./storage";

function logEdit(userId: string, printId: string, field: string, name: string): void {
  void createLog({ userId, action: "model_edited", targetId: printId, details: { field, name } });
}

async function relocateAfterEdit(print: Parameters<typeof relocatePrint>[0], printId: string): Promise<void> {
  const plates = await prisma.plate.findMany({ where: { printId }, orderBy: { position: "asc" } });
  await relocatePrint(print, plates);
}

/** Counts owner views too: lastViewedAt drives Browsing History. */
export async function viewPrint(userId: string, printId: string): Promise<PrintOut> {
  await prisma.print.updateMany({
    where: { id: printId, userId },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
  return printOutById(userId, printId);
}

async function updateOwned(userId: string, printId: string, data: Prisma.PrintUpdateManyMutationInput) {
  const result = await prisma.print.updateMany({ where: { id: printId, userId }, data });
  if (result.count === 0) throw notFound("Print not found");
  return printOutById(userId, printId);
}

export function setFavorite(userId: string, printId: string, favorite: boolean): Promise<PrintOut> {
  return updateOwned(userId, printId, { favoritedAt: favorite ? new Date() : null });
}

/**
 * Recorded explicitly by the detail page: the file/zip routes also serve the viewer, snapshots
 * and bulk zips, which aren't downloads of this model.
 */
export function recordDownload(userId: string, printId: string): Promise<PrintOut> {
  return updateOwned(userId, printId, { printCount: { increment: 1 } });
}

export async function setTags(userId: string, printId: string, tags: string[]): Promise<PrintOut> {
  const print = await requireWritablePrint(userId, printId, "EDIT");
  const updated = await prisma.print.update({ where: { id: print.id }, data: { tags: normalizeTags(tags) } });
  await relocateAfterEdit(updated, print.id);
  logEdit(userId, print.id, "tags", updated.name);
  return printOutById(userId, print.id);
}

export async function updateMeta(
  userId: string,
  printId: string,
  body: { name?: string; title?: string; notes?: string; creator?: string },
): Promise<PrintOut> {
  const print = await requireWritablePrint(userId, printId, "EDIT");
  const data: Prisma.PrintUpdateInput = {};
  const requestedName = body.name !== undefined ? body.name : body.title;
  if (requestedName !== undefined) {
    const nextName = await uniqueModelName(print.userId, requestedName, print.categoryId, print.id);
    if (nextName !== print.name) {
      data.name = nextName;
      data.nameNormalized = nextName.trim().toLowerCase();
      data.title = nextName;
    }
  }
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.creator !== undefined) data.creator = body.creator.trim() || null;

  const updated = await prisma.print.update({ where: { id: print.id }, data });
  await relocateAfterEdit(updated, print.id);
  logEdit(userId, print.id, "meta", updated.name);
  return printOutById(userId, print.id);
}

/** Filing is the owner's own business: collection editors can't move a model between the owner's categories. */
export async function setCategory(userId: string, printId: string, categoryIdOrNull: string | null | undefined) {
  const print = await requireOwnedPrint(userId, printId);
  const categoryId = categoryIdOrNull || null;
  const data: Prisma.PrintUpdateInput = {};
  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw badRequest("Category not found");
    await uniqueModelName(userId, print.name, category.id, print.id);
    data.category = { connect: { id: category.id } };
  } else {
    await uniqueModelName(userId, print.name, null, print.id);
    data.category = { disconnect: true };
  }
  const updated = await prisma.print.update({ where: { id: print.id }, data });
  await relocateAfterEdit(updated, print.id);
  logEdit(userId, print.id, "category", updated.name);
  return printOutById(userId, print.id);
}

/**
 * Resets author/source linkage so the print reads like the user's own upload, deleting the Author
 * row if nothing else references it.
 */
export async function resetAuthor(userId: string, printId: string): Promise<PrintOut> {
  const print = await requireOwnedPrint(userId, printId);
  await prisma.print.update({
    where: { id: print.id },
    data: { authorId: null, creator: null, sourceProvider: null, sourceExternalId: null },
  });
  if (print.authorId) await deleteAuthorIfOrphaned(print.authorId);
  await relocatePrintsForToken("creator", [print.id]);
  logEdit(userId, print.id, "author_reset", print.name);
  return printOutById(userId, print.id);
}

export async function deletePrint(userId: string, printId: string): Promise<void> {
  const full = await loadFullPrint(userId, printId);
  // loadFullPrint authorizes shared readers too; deleting needs ownership or the DELETE role.
  const allowed = await prisma.print.count({ where: { id: printId, ...printWriteWhere(userId, "DELETE") } });
  if (!allowed) {
    throw full.print.userId === userId ? notFound("You can't delete this model") : forbidden("You can't delete this model");
  }
  await deleteAllPrintFiles(printId);
  await deleteAllPreviewImages(printId);
  await prisma.print.delete({ where: { id: printId } });
  for (const plate of full.plates) {
    await deletePlateFiles(plate);
    await fs.rm(plateThumbPath(plate.id), { force: true }).catch(() => undefined);
  }
  void createLog({ userId, action: "model_deleted", targetId: printId, details: { name: full.print.name } });
}

import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import type { Author } from "../../generated/prisma/client";
import { createPrint, type NewPlateInput, type PrintMetaInput } from "../prints/index";
import { attachImportedPreviewImages } from "./previewImages";
import { findExistingImportedPrint, previewImagesOf } from "./importedPrints";
import type { SourceModel } from "./sourceLinks";
import type { ImportedPrint, ImportedPageMetadata, ImportRequestBody } from "./types";

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

const CATEGORY_SITE_CAT_IDS_FIELD = {
  makerworld: "makerworldCatIds",
  thingiverse: "thingiverseCatIds",
  printables: "printablesCatIds",
} as const;

/** Auto-categorizes an import when a category's `*CatIds` for this site overlap the model's own
 * category ids. Best-effort. */
async function resolveCategoryIdByCategory(
  userId: string,
  categorySite: ImportedPageMetadata["categorySite"],
  siteCategoryIds: number[],
): Promise<string | null> {
  if (!categorySite || !siteCategoryIds.length) return null;
  const field = CATEGORY_SITE_CAT_IDS_FIELD[categorySite];
  const category = await prisma.category.findFirst({
    where: { userId, [field]: { hasSome: siteCategoryIds } },
    orderBy: { position: "asc" },
  });
  return category?.id ?? null;
}

type SourceMeta = Partial<
  Pick<ImportedPageMetadata, "title" | "description" | "tags" | "creator" | "categorySite" | "siteCategoryIds">
>;

/** What the user typed wins over what the provider's page says; an explicit category over an auto-matched one. */
export async function buildPrintMeta(
  userId: string,
  body: ImportRequestBody,
  meta: SourceMeta,
  author: Author | null,
  source: SourceModel | null,
): Promise<PrintMetaInput> {
  const categoryId =
    body.category_id ??
    (await resolveCategoryIdByCategory(userId, meta.categorySite ?? null, meta.siteCategoryIds ?? []));
  return {
    title: body.title ?? meta.title ?? null,
    notes: body.notes ?? meta.description ?? null,
    tags: body.tags && body.tags.length ? body.tags : (meta.tags ?? []),
    categoryId,
    creator: meta.creator ?? null,
    authorId: author?.id ?? null,
    sourceProvider: source?.provider ?? null,
    sourceExternalId: source?.externalId ?? null,
  };
}

/**
 * Creates the Print and attaches its cover and gallery. If a concurrent import of the same source model
 * won the race (unique constraint on the source), the winner is returned as already imported.
 */
export async function createImportedPrint(
  userId: string,
  source: SourceModel | null,
  printMeta: PrintMetaInput,
  fallbackName: string,
  inputs: NewPlateInput[],
  author: Author | null,
  images: { cover: string | null | undefined; gallery: { url: string; filename: string }[]; paceMs?: number },
): Promise<ImportedPrint> {
  let result: Awaited<ReturnType<typeof createPrint>>;
  try {
    result = await createPrint(userId, printMeta, fallbackName, inputs);
  } catch (err) {
    if (source && isUniqueConstraintError(err)) {
      const existing = await findExistingImportedPrint(userId, source);
      if (existing) return { ...existing, alreadyImported: true };
    }
    throw err;
  }
  await attachImportedPreviewImages(result.print.id, result.plates[0]?.id, images.cover, images.gallery, images.paceMs);
  const previewImages = await previewImagesOf(result.print.id);
  return { ...result, author, previewImages, alreadyImported: false };
}

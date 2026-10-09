import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../db";
import { notFound } from "../../http/errors";
import { writeZip, type ZipEntryDescriptor } from "../../lib/zipWriter";
import type { Category, Plate, Print, Prisma } from "../../generated/prisma/client";
import { resolvePlateFilePath } from "./printCreation";
import { managedPrintFilePath } from "./printFiles";

export type PrintWithPlatesAndCategory = Print & { plates: Plate[]; category: Category | null };

/** At least one must be set; multiple are ANDed. */
type DownloadZipFilter = {
  print_ids?: string[];
  tag?: string;
  category_id?: string;
  collection_id?: string;
};

/** `tag` is applied in JS since tags aren't a filterable column. Throws 404 for a collection that
 *  isn't the user's. */
export async function resolvePrintsForDownload(
  userId: string,
  filter: DownloadZipFilter,
): Promise<PrintWithPlatesAndCategory[]> {
  const where: Prisma.PrintWhereInput = { userId };
  if (filter.print_ids?.length) where.id = { in: filter.print_ids };
  if (filter.category_id) where.categoryId = filter.category_id;
  if (filter.collection_id) {
    const collection = await prisma.collection.findFirst({ where: { id: filter.collection_id, userId } });
    if (!collection) throw notFound("Collection not found");
    where.collectionItems = { some: { collectionId: filter.collection_id } };
  }
  let prints = await prisma.print.findMany({
    where,
    include: { plates: { orderBy: { position: "asc" } }, category: true },
  });
  if (filter.tag) {
    const tag = filter.tag.trim();
    prints = prints.filter((p) => p.tags.includes(tag));
  }
  return prints;
}

/** An upper bound from stored sizes, without touching the filesystem. */
export async function estimateDownloadSize(prints: PrintWithPlatesAndCategory[]): Promise<number> {
  const plateBytes = prints.reduce((sum, p) => sum + p.plates.reduce((s, plate) => s + plate.size, 0), 0);
  const printIds = prints.map((p) => p.id);
  if (!printIds.length) return plateBytes;
  const supporting = await prisma.printFile.aggregate({
    where: { printId: { in: printIds }, role: "SUPPORTING" },
    _sum: { size: true },
  });
  return plateBytes + (supporting._sum.size ?? 0);
}

/**
 * `{category}/{print.name}/{plate.filename}`, with supporting files under `.../supporting/`.
 * `flatten` drops the category folder, for downloads that span categories.
 */
async function buildZipEntries(
  prints: PrintWithPlatesAndCategory[],
  opts: { flatten?: boolean } = {},
): Promise<ZipEntryDescriptor[]> {
  const printIds = prints.map((p) => p.id);
  const supportingByPrint = new Map<string, { filename: string; storagePath: string }[]>();
  if (printIds.length) {
    const supporting = await prisma.printFile.findMany({
      where: { printId: { in: printIds }, role: "SUPPORTING" },
    });
    for (const file of supporting) {
      const list = supportingByPrint.get(file.printId) ?? [];
      list.push({ filename: file.filename, storagePath: file.storagePath });
      supportingByPrint.set(file.printId, list);
    }
  }

  const entries: ZipEntryDescriptor[] = [];
  for (const print of prints) {
    const prefix = opts.flatten ? print.name : `${print.category?.name || "unassigned"}/${print.name}`;
    const sortedPlates = print.plates.toSorted((a, b) => a.position - b.position);
    for (const plate of sortedPlates) {
      const filePath = resolvePlateFilePath(plate);
      if (filePath) entries.push({ arcname: `${prefix}/${plate.filename}`, filePath });
    }
    for (const file of supportingByPrint.get(print.id) ?? []) {
      const filePath = managedPrintFilePath(file);
      if (fs.existsSync(filePath)) {
        entries.push({ arcname: `${prefix}/supporting/${file.filename}`, filePath });
      }
    }
  }
  return entries;
}

/** The archive's file name: a tag, category or collection download is named after it, else `fallback`. */
export async function downloadZipName(
  userId: string,
  filter: DownloadZipFilter,
  prints: PrintWithPlatesAndCategory[],
  fallback: string | undefined,
): Promise<string> {
  let name = fallback || "thingport.zip";
  if (filter.tag) {
    name = `${filter.tag.replace(/ /g, "_").slice(0, 50) || "tag"}.zip`;
  }
  if (filter.category_id) {
    const category = prints.find((p) => p.category)?.category;
    if (category) name = `${category.name.replace(/ /g, "_").slice(0, 50) || "category"}.zip`;
  }
  if (filter.collection_id) {
    const collection = await prisma.collection.findFirst({ where: { id: filter.collection_id, userId } });
    if (collection) name = `${collection.name.replace(/ /g, "_").slice(0, 50) || "collection"}.zip`;
  }
  return name;
}

/** Writes the prints' files into a temporary zip and returns its path; the caller deletes it. */
export async function writePrintsZip(
  prints: PrintWithPlatesAndCategory[],
  opts: { flatten?: boolean } = {},
): Promise<string> {
  const entries = await buildZipEntries(prints, opts);
  if (!entries.length) throw notFound("No files available for download");

  const tmpPath = path.join(os.tmpdir(), `thingport-zip-${crypto.randomBytes(8).toString("hex")}.zip`);
  await writeZip(tmpPath, entries);
  return tmpPath;
}

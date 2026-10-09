import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { badRequest, conflict } from "../../http/errors";
import { logger } from "../../lib/logger";
import { STORAGE } from "../../config";
import { prisma } from "../../db";
import type { Category, Plate, Print } from "../../generated/prisma/client";
import { pruneEmptyDirs } from "./files";

export const STORAGE_TEMPLATE_TOKENS = [
  "category",
  "collection",
  "tags",
  "creator",
  "model",
  "filename",
  "id",
  "plate",
] as const;

// Older names still accepted in a saved template, and rewritten to the current one whenever the
// template is validated -- so the admin page shows (and the next save stores) the new name.
// {name} was always the same value as {model}.
const LEGACY_TOKEN_ALIASES: Record<string, (typeof STORAGE_TEMPLATE_TOKENS)[number]> = {
  name: "model",
};

/** The {collection} folder for a model in no collection, and for one in more than one. */
const NO_COLLECTION_FOLDER = "Uncollected";
const MULTIPLE_COLLECTIONS_FOLDER = "Multiple collections";

export const DEFAULT_STORAGE_TEMPLATE = "{category}/{model}/{filename}";

const TOKEN_RE = /\{([a-z_]+)\}/g;
// oxlint-disable-next-line no-control-regex -- stripping control chars is the point here.
const INVALID_SEGMENT_RE = /[<>:"|?*\x00-\x1f]/g;

export function sanitizePathSegment(value: string | null | undefined, fallback: string): string {
  let cleaned = (value || "").trim().replace(INVALID_SEGMENT_RE, "_");
  cleaned = cleaned
    .replace(/\//g, "_")
    .replace(/\\/g, "_")
    .replace(/^[ .]+|[ .]+$/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "..") cleaned = fallback;
  return cleaned.slice(0, 120);
}

export function validateStorageTemplate(template: string | null | undefined): string {
  const normalized = (template || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(TOKEN_RE, (match, token: string) =>
      token in LEGACY_TOKEN_ALIASES ? `{${LEGACY_TOKEN_ALIASES[token]}}` : match,
    );
  if (!normalized) throw badRequest("Storage template cannot be empty");
  const tokens = [...normalized.matchAll(TOKEN_RE)].map((m) => m[1]);
  const unknown = tokens.filter((t) => !(STORAGE_TEMPLATE_TOKENS as readonly string[]).includes(t));
  if (unknown.length) throw badRequest(`Unknown storage token: {${unknown[0]}}`);
  const filenameCount = (normalized.match(/\{filename\}/g) || []).length;
  if (filenameCount !== 1) throw badRequest("Storage template must contain {filename} exactly once");
  const finalSegment = normalized.split("/").pop() || "";
  if (!finalSegment.includes("{filename}")) {
    throw badRequest("{filename} must be in the final path segment");
  }
  const stripped = normalized.replace(TOKEN_RE, "");
  if (stripped.includes("{") || stripped.includes("}")) {
    throw badRequest("Storage template contains an invalid token");
  }
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw badRequest("Storage template contains an unsafe path segment");
  }
  return normalized;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (_match, token: string) => {
    if (!(token in values)) throw badRequest(`Unknown storage token: {${token}}`);
    return values[token];
  });
}

async function categorySegments(userId: string, categoryId: string | null | undefined): Promise<string[]> {
  if (!categoryId) return ["Unassigned"];
  const segments: string[] = [];
  const visited = new Set<string>();
  let current: Category | null = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(sanitizePathSegment(current.name, "Category"));
    current = current.parentId ? await prisma.category.findFirst({ where: { id: current.parentId, userId } }) : null;
  }
  return segments.length ? segments : ["Unassigned"];
}

function assertWithinStorage(relative: string): string {
  const candidate = path.resolve(STORAGE, relative);
  const root = path.resolve(STORAGE);
  if (candidate === root || !candidate.startsWith(root + path.sep)) {
    throw badRequest("Storage template resolved outside the storage directory");
  }
  return relative;
}

type PrintLike = Pick<
  Print,
  "id" | "name" | "creator" | "tags" | "categoryId" | "userId" | "authorId" | "sourceProvider"
>;

function templateUses(template: string, token: (typeof STORAGE_TEMPLATE_TOKENS)[number]): boolean {
  return template.includes(`{${token}}`);
}

/** {creator}: the author the model page shows (ModelSidePanel): the imported Author's name or handle, else
 *  the plain-text creator an import stored, else -- for the owner's own upload, which has no
 *  source -- the owner. */
async function creatorLabel(print: PrintLike): Promise<string | null> {
  if (print.authorId) {
    const author = await prisma.author.findUnique({
      where: { id: print.authorId },
      select: { name: true, handle: true },
    });
    if (author?.name || author?.handle) return author.name || author.handle;
  }
  if (print.creator) return print.creator;
  if (print.sourceProvider) return null;
  const owner = await prisma.user.findUnique({ where: { id: print.userId }, select: { displayName: true } });
  return owner?.displayName ?? null;
}

/** A model can be in any number of collections; a folder can only hold it once. */
async function collectionLabel(printId: string): Promise<string> {
  const items = await prisma.collectionItem.findMany({
    where: { printId },
    select: { collection: { select: { name: true } } },
    take: 2,
  });
  if (items.length === 0) return NO_COLLECTION_FOLDER;
  if (items.length > 1) return MULTIPLE_COLLECTIONS_FOLDER;
  return items[0].collection.name;
}

type PrintTemplateValues = Record<string, string>;

/** Every token's value for one print, other than the per-plate {filename}/{plate}. Tokens that
 *  need their own query are only looked up when the template uses them. */
async function printTemplateValues(print: PrintLike, template: string): Promise<PrintTemplateValues> {
  const tagLabel =
    (print.tags || [])
      .map((t) => t.trim())
      .filter(Boolean)
      .join(" + ") || "Untagged";
  return {
    category: templateUses(template, "category")
      ? (await categorySegments(print.userId, print.categoryId)).join("/")
      : "",
    collection: templateUses(template, "collection")
      ? sanitizePathSegment(await collectionLabel(print.id), NO_COLLECTION_FOLDER)
      : "",
    tags: sanitizePathSegment(tagLabel, "Untagged"),
    creator: templateUses(template, "creator") ? sanitizePathSegment(await creatorLabel(print), "Unknown creator") : "",
    model: sanitizePathSegment(print.name, "Model"),
    id: print.id,
  };
}

function renderPlatePath(
  print: PrintLike,
  template: string,
  printValues: PrintTemplateValues,
  plateFilename: string,
  platePosition: number,
): string {
  const values = {
    ...printValues,
    filename: sanitizePathSegment(plateFilename, "file"),
    plate: String(platePosition + 1),
  };
  const rendered = renderTemplate(template, values).replace(/\\/g, "/");
  const parts = rendered
    .split("/")
    .filter(Boolean)
    .map((part) => sanitizePathSegment(part, "item"));
  if (!parts.length) throw badRequest("Storage template produced an empty path");
  const userSegment = sanitizePathSegment(`u-${print.userId}`, "user");
  return assertWithinStorage(path.join(userSegment, ...parts));
}

/** Renders the on-disk relative path for one plate of a print using the storage template.
 * Every user's files live under their own u-<userId> segment beneath the (instance-wide)
 * rendered template, invisibly -- the template's own tokens/UX are unaware of it. */
export async function renderPlateStoragePath(
  print: PrintLike,
  plateFilename: string,
  platePosition: number,
  template?: string | null,
): Promise<string> {
  const safeTemplate = validateStorageTemplate(template ?? (await getStorageTemplate()));
  const printValues = await printTemplateValues(print, safeTemplate);
  return renderPlatePath(print, safeTemplate, printValues, plateFilename, platePosition);
}

export function samplePlateStoragePaths(template: string): [string, string] {
  const safeTemplate = validateStorageTemplate(template);
  const base = {
    category: "Props/Workshop",
    collection: "Tabletop",
    tags: "Print in place + Useful",
    creator: "Example creator",
    model: "Multi-part gadget",
    id: "a1b2c3d4",
  };
  const first = renderTemplate(safeTemplate, { ...base, filename: "Base.3mf", plate: "1" });
  const second = renderTemplate(safeTemplate, { ...base, filename: "Lid.3mf", plate: "2" });
  return [first, second];
}

export function managedPlatePath(plate: Pick<Plate, "storagePath">): string {
  return path.join(STORAGE, plate.storagePath);
}

export function pruneEmptyStorageDirs(start: string): Promise<void> {
  return pruneEmptyDirs(start, STORAGE);
}

/**
 * Moves every plate of a print after a change to anything its storage path is built from.
 * Supporting and prepared files live at a fixed bundles/ path and aren't touched.
 */
export async function relocatePrint(print: PrintLike, plates: Plate[], template?: string | null): Promise<void> {
  const safeTemplate = validateStorageTemplate(template ?? (await getStorageTemplate()));
  const printValues = await printTemplateValues(print, safeTemplate);
  for (const plate of plates) {
    const oldPath = managedPlatePath(plate);
    const newRelative = renderPlatePath(print, safeTemplate, printValues, plate.filename, plate.position);
    const newPath = path.join(STORAGE, newRelative);
    if (path.resolve(oldPath) === path.resolve(newPath)) {
      if (plate.storagePath !== newRelative) {
        await prisma.plate.update({ where: { id: plate.id }, data: { storagePath: newRelative } });
      }
      continue;
    }
    const collision = await prisma.plate.findFirst({ where: { storagePath: newRelative, id: { not: plate.id } } });
    if (collision) throw conflict(`Storage path already exists: ${newRelative}`);
    const oldExists = fsSync.existsSync(oldPath);
    if (oldExists) {
      await fs.mkdir(path.dirname(newPath), { recursive: true });
      await fs.rename(oldPath, newPath);
      await pruneEmptyStorageDirs(path.dirname(oldPath));
    }
    await prisma.plate.update({ where: { id: plate.id }, data: { storagePath: newRelative } });
  }
}

/** Moves the given prints' files after a change that only matters when the storage template
 * uses `token` -- a collection membership change, say, moves nothing under the default
 * {category}/{model}/{filename}. Best-effort per print, like reorganizeManagedPrints: the change
 * itself has already been saved, and one print's file collision shouldn't undo it or block the
 * others. */
export async function relocatePrintsForToken(
  token: (typeof STORAGE_TEMPLATE_TOKENS)[number],
  printIds: string[],
): Promise<void> {
  if (!printIds.length) return;
  const template = validateStorageTemplate(await getStorageTemplate());
  if (!templateUses(template, token)) return;
  const prints = await prisma.print.findMany({ where: { id: { in: printIds } }, include: { plates: true } });
  for (const print of prints) {
    try {
      await relocatePrint(print, print.plates, template);
    } catch (err) {
      logger.error(`Could not move the files of print ${print.id} after a {${token}} change`, { error: err });
    }
  }
}

/** Re-lays-out managed print storage. Pass `userId` for a category rename/delete affecting only
 * that user's own prints; omit it for an instance-wide storage-template change (admin-only --
 * see requireAdmin on POST /settings/storage), which needs to touch every user's files. */
export async function reorganizeManagedPrints(
  template?: string | null,
  userId?: string,
): Promise<{ moved: number; skipped: number }> {
  let moved = 0;
  let skipped = 0;
  const prints = await prisma.print.findMany({
    where: userId ? { userId } : undefined,
    include: { plates: true },
    orderBy: { id: "asc" },
  });
  for (const print of prints) {
    try {
      const before = new Map(print.plates.map((p) => [p.id, p.storagePath]));
      await relocatePrint(print, print.plates, template);
      const after = await prisma.plate.findMany({ where: { printId: print.id } });
      for (const plate of after) {
        if (before.get(plate.id) !== plate.storagePath) moved += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { moved, skipped };
}

// -- Settings (storage template) -----------------------------------------

export async function getStorageTemplate(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: "storage_path_template" } });
  return typeof row?.value === "string" ? row.value : DEFAULT_STORAGE_TEMPLATE;
}

export async function setStorageTemplate(value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "storage_path_template" },
    create: { key: "storage_path_template", value },
    update: { value },
  });
}

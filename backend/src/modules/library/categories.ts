import type { Category, Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { badRequest, notFound } from "../../http/errors";
import { normalizeTags } from "../../lib/tags";
import { availableModelName, reorganizeManagedPrints } from "../../services/printService";
import { DEFAULT_CATEGORIES, type DefaultCategoryNode } from "./defaultCategories";

const SIBLING_ORDER: Prisma.CategoryOrderByWithRelationInput[] = [{ position: "asc" }, { name: "asc" }];

export type CategoryInput = { name: string; tags: string[]; parent_id?: string | null };

export type CategoryMetaInput = {
  meta_title?: string | null;
  meta_description?: string | null;
  makerworld_cat_ids?: string | null;
  thingiverse_cat_ids?: string | null;
  printables_cat_ids?: string | null;
};

/** The user's own category, or a 404 (`message` differs between endpoints, as it always did). */
export async function requireCategory(userId: string, id: string, message = "Not found"): Promise<Category> {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) throw notFound(message);
  return category;
}

export function listCategories(userId: string): Promise<Category[]> {
  return prisma.category.findMany({ where: { userId }, orderBy: SIBLING_ORDER });
}

/** Any depth is allowed; only cycles are rejected (a category under itself or its own descendant). */
export async function validateParentCategory(
  userId: string,
  parentId: string | null | undefined,
  categoryId?: string | null,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.category.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw badRequest("Parent category not found");
  if (categoryId && parentId === categoryId) throw badRequest("Category cannot be its own parent");

  if (categoryId) {
    // One read of the user's tree instead of a query per ancestor. `visited` guards against a cycle
    // already in the data.
    const rows = await prisma.category.findMany({ where: { userId }, select: { id: true, parentId: true } });
    const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
    const visited = new Set<string>();
    let ancestorId = parent.parentId;
    while (ancestorId && !visited.has(ancestorId)) {
      if (ancestorId === categoryId) {
        throw badRequest("A category cannot be moved under one of its own subcategories");
      }
      visited.add(ancestorId);
      ancestorId = parentOf.get(ancestorId) ?? null;
    }
  }

  return parentId;
}

export async function createCategory(userId: string, input: CategoryInput): Promise<Category> {
  const parentId = await validateParentCategory(userId, input.parent_id ?? null);
  return prisma.category.create({ data: { userId, name: input.name, tags: normalizeTags(input.tags), parentId } });
}

export async function updateCategory(userId: string, id: string, input: CategoryInput): Promise<Category> {
  const category = await requireCategory(userId, id);
  const parentId = await validateParentCategory(userId, input.parent_id ?? null, category.id);
  const updated = await prisma.category.update({
    where: { id: category.id },
    data: { name: input.name, tags: normalizeTags(input.tags), parentId },
  });
  // Managed storage paths include the category path.
  await reorganizeManagedPrints(undefined, userId);
  return updated;
}

/** `ids` must be exactly the siblings under one parent, in their new order. */
export async function reorderCategories(userId: string, ids: string[]): Promise<void> {
  const categories = await prisma.category.findMany({ where: { id: { in: ids }, userId } });
  if (categories.length !== ids.length) throw badRequest("category_ids must reference existing categories");
  const parentIds = new Set(categories.map((c) => c.parentId ?? null));
  if (parentIds.size > 1) throw badRequest("category_ids must all share the same parent category");
  const [parentId] = parentIds;
  const siblingCount = await prisma.category.count({ where: { userId, parentId } });
  if (siblingCount !== ids.length) {
    throw badRequest("category_ids must contain exactly this category's current siblings");
  }
  await prisma.$transaction(ids.map((id, idx) => prisma.category.update({ where: { id }, data: { position: idx } })));
}

/** Reparents and positions in one step, so dragging a subcategory into another category is one request. */
export async function moveCategory(
  userId: string,
  id: string,
  target: { parent_id: string | null; position: number },
): Promise<Category> {
  const category = await requireCategory(userId, id);
  const parentId = await validateParentCategory(userId, target.parent_id, category.id);

  const moved = await prisma.$transaction(async (tx) => {
    const positions = new Map<string, number>();
    const siblingsOf = async (parent: string | null) => {
      const rows = await tx.category.findMany({
        where: { userId, parentId: parent, id: { not: category.id } },
        orderBy: SIBLING_ORDER,
        select: { id: true, position: true },
      });
      for (const row of rows) positions.set(row.id, row.position);
      return rows.map((row) => row.id);
    };
    // Rows that already sit at their index are not rewritten.
    const renumber = async (ids: string[]) => {
      for (const [idx, siblingId] of ids.entries()) {
        if (siblingId !== category.id && positions.get(siblingId) !== idx) {
          await tx.category.update({ where: { id: siblingId }, data: { position: idx } });
        }
      }
    };

    if (category.parentId !== parentId) {
      // Close the gap left behind.
      await renumber(await siblingsOf(category.parentId));
    }
    const ids = await siblingsOf(parentId);
    ids.splice(Math.min(target.position, ids.length), 0, category.id);
    await renumber(ids);
    return tx.category.update({ where: { id: category.id }, data: { parentId, position: ids.indexOf(category.id) } });
  });

  if (category.parentId !== parentId) await reorganizeManagedPrints(undefined, userId);
  return moved;
}

const MAX_CAT_IDS = 50;

/** Parses "800;71;1001" into ids. Blank clears; stray or duplicate separators are tolerated;
 * anything not a positive integer is rejected with a message naming it. */
export function parseCatIdsInput(raw: string | null | undefined): number[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  const tokens = trimmed
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const token of tokens) {
    if (!/^\d+$/.test(token) || token.length > 15) {
      throw badRequest(`Invalid category id "${token}" -- use numbers separated by ";", e.g. 800;71;1001`);
    }
    const id = Number(token);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw badRequest(`Invalid category id "${token}" -- must be a positive whole number`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length > MAX_CAT_IDS) {
    throw badRequest(`Too many category ids -- at most ${MAX_CAT_IDS} allowed`);
  }
  return ids;
}

export async function updateCategoryMeta(userId: string, id: string, input: CategoryMetaInput): Promise<Category> {
  const category = await requireCategory(userId, id);
  return prisma.category.update({
    where: { id: category.id },
    data: {
      metaTitle: input.meta_title || null,
      metaDescription: input.meta_description || null,
      makerworldCatIds: parseCatIdsInput(input.makerworld_cat_ids),
      thingiverseCatIds: parseCatIdsInput(input.thingiverse_cat_ids),
      printablesCatIds: parseCatIdsInput(input.printables_cat_ids),
    },
  });
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const category = await requireCategory(userId, id);

  // Subcategories move up one level, after the deleted category's former siblings.
  const children = await prisma.category.findMany({
    where: { parentId: category.id, userId },
    orderBy: SIBLING_ORDER,
    select: { id: true },
  });
  if (children.length) {
    const last = await prisma.category.findFirst({
      where: { userId, parentId: category.parentId, id: { not: category.id } },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const start = (last?.position ?? -1) + 1;
    await prisma.$transaction(
      children.map((child, idx) =>
        prisma.category.update({
          where: { id: child.id },
          data: { parentId: category.parentId, position: start + idx },
        }),
      ),
    );
  }

  // One by one: each rename must see the names the previous ones took.
  const prints = await prisma.print.findMany({
    where: { categoryId: category.id, userId },
    select: { id: true, name: true },
  });
  for (const print of prints) {
    const nextName = await availableModelName(userId, print.name, null, print.id);
    const data: Prisma.PrintUpdateInput = { category: { disconnect: true } };
    if (nextName !== print.name) {
      data.name = nextName;
      data.nameNormalized = nextName.trim().toLowerCase();
      data.title = nextName;
    }
    await prisma.print.update({ where: { id: print.id }, data });
  }

  await prisma.category.delete({ where: { id: category.id } });
  await reorganizeManagedPrints(undefined, userId);
}

/** The models of one category with what the zip builder needs, and the zip's file name. */
export async function loadCategoryDownload(userId: string, id: string) {
  const category = await requireCategory(userId, id, "Category not found");
  const prints = await prisma.print.findMany({
    where: { categoryId: category.id, userId },
    include: { plates: { orderBy: { position: "asc" } }, category: true },
  });
  const downloadName = `${(category.name || "category").replace(/ /g, "_").slice(0, 50) || "category"}.zip`;
  return { prints, downloadName };
}

/** Takes a Prisma client so it can run in the user-creation transaction. */
export async function seedDefaultCategories(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  async function createNode(node: DefaultCategoryNode, parentId: string | null, position: number): Promise<void> {
    const category = await tx.category.create({
      data: {
        userId,
        name: node.name,
        tags: node.tags ?? [],
        parentId,
        position,
        metaTitle: node.metaTitle ?? null,
        metaDescription: node.metaDescription ?? null,
        makerworldCatIds: node.makerworldCatIds ?? [],
        thingiverseCatIds: node.thingiverseCatIds ?? [],
        printablesCatIds: node.printablesCatIds ?? [],
      },
    });
    for (const [i, child] of (node.children ?? []).entries()) {
      await createNode(child, category.id, i);
    }
  }

  for (const [i, root] of DEFAULT_CATEGORIES.entries()) {
    await createNode(root, null, i);
  }
}

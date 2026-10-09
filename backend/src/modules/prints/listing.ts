import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { getLinkedAuthorIds } from "../library/index";
import { systemCollectionKeyForId } from "../library/index";
import { collectionReadWhere, printReadWhere, sharedWithMeWhere, viewerRolesByPrint } from "./access";
import type { PrintOut } from "./dto";
import { groupByPrintId, printOutFromParts, printRowInclude } from "./printLoader";
import { SELF_AUTHOR_ID, type ListPrintsQuery, type PrintFilters } from "./schemas";

// Postgres array containment is case-sensitive, so tags are matched in JS after fetching.
function matchesTagList(printTags: string[], tagList: string[]): boolean {
  if (!tagList.length) return true;
  const printTagsLower = new Set(printTags.map((t) => t.toLowerCase()));
  return tagList.every((t) => printTagsLower.has(t.toLowerCase()));
}

function baseWhere(me: string, scope: string): Prisma.PrintWhereInput {
  if (scope === "shared") return { userId: { not: me }, ...sharedWithMeWhere(me) };
  if (scope === "all") return printReadWhere(me);
  return { userId: me };
}

async function buildPrintWhere(me: string, filters: PrintFilters): Promise<Prisma.PrintWhereInput> {
  const { q, category_id: categoryIds, collection_id: collectionId, author_id: authorId } = filters;
  const systemKey = collectionId ? systemCollectionKeyForId(collectionId) : null;
  // Favourites/History are inherently personal, so they force "mine".
  let base = baseWhere(me, systemKey ? "mine" : filters.scope);
  const where: Prisma.PrintWhereInput = {};
  // AND clauses so the self-author and search OR groups don't clobber each other.
  const andClauses: Prisma.PrintWhereInput[] = [];
  if (categoryIds.length === 1) where.categoryId = categoryIds[0];
  else if (categoryIds.length > 1) where.categoryId = { in: categoryIds };
  if (authorId === SELF_AUTHOR_ID) {
    // "My models": prints with no author at all, or by an Author the user linked as themselves.
    const linkedAuthorIds = await getLinkedAuthorIds(me);
    andClauses.push({
      OR: [
        { authorId: null, creator: null, sourceProvider: null },
        ...(linkedAuthorIds.length ? [{ authorId: { in: linkedAuthorIds } }] : []),
      ],
    });
  } else if (authorId) {
    where.authorId = authorId;
  }
  if (collectionId) {
    if (systemKey === "favorites") where.favoritedAt = { not: null };
    else if (systemKey === "history") where.lastViewedAt = { not: null };
    else {
      where.collectionItems = { some: { collectionId } };
      // A real collection you can see is yours or shared with you. When it's shared (not yours), show
      // the models in it that are readable to you, replacing the "my models" base: your own models
      // aren't in someone else's collection.
      const coll = await prisma.collection.findFirst({
        where: { id: collectionId, ...collectionReadWhere(me) },
        select: { userId: true },
      });
      if (!coll) {
        where.id = "__no_access__";
      } else if (coll.userId !== me) {
        base = {};
        andClauses.push(printReadWhere(me));
      }
    }
  }
  if (q) {
    andClauses.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { creator: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (andClauses.length) where.AND = andClauses;
  return { ...base, ...where };
}

export type PrintPage = {
  items: PrintOut[];
  /** Set only when the request asked for a page. */
  paging?: { hasMore: boolean; nextOffset: number; total: number };
};

/**
 * Two steps: sort and page over slim rows, then load the heavy relations for one page only.
 */
export async function listPrints(userId: string, query: ListPrintsQuery): Promise<PrintPage> {
  const { filters, sort, limit, offset } = query;
  const where = await buildPrintWhere(userId, filters);
  const allMatching = await prisma.print.findMany({
    where,
    select: {
      id: true,
      tags: true,
      viewCount: true,
      printCount: true,
      createdAt: true,
      favoritedAt: true,
      lastViewedAt: true,
    },
  });
  const prints = filters.tags.length ? allMatching.filter((p) => matchesTagList(p.tags, filters.tags)) : allMatching;

  // Under "newest", Favourites and Browsing History sort by when they were favorited/viewed.
  const systemKey = systemCollectionKeyForId(filters.collection_id);
  const recencyField = systemKey === "favorites" ? "favoritedAt" : systemKey === "history" ? "lastViewedAt" : null;

  const sortValue = (p: (typeof prints)[number]): number => {
    if (sort === "popular") return p.viewCount;
    if (sort === "downloads") return p.printCount;
    if (recencyField) return p[recencyField]?.getTime() ?? 0;
    return p.createdAt.getTime();
  };

  const sorted = prints.toSorted((a, b) => {
    const diff = sortValue(b) - sortValue(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  let paged = sorted;
  let paging: PrintPage["paging"];
  if (limit !== undefined) {
    const start = offset ?? 0;
    paged = sorted.slice(start, start + limit);
    paging = {
      hasMore: sorted.length > start + paged.length,
      nextOffset: start + paged.length,
      total: sorted.length,
    };
  }

  return {
    items: await loadPage(
      userId,
      paged.map((p) => p.id),
    ),
    paging,
  };
}

async function loadPage(userId: string, pageIds: string[]): Promise<PrintOut[]> {
  if (!pageIds.length) return [];
  const [full, rolesByPrint, files] = await Promise.all([
    prisma.print.findMany({
      where: { id: { in: pageIds } },
      include: {
        ...printRowInclude,
        plates: { orderBy: { position: "asc" } },
        previewImages: { orderBy: { position: "asc" } },
        category: true,
      },
    }),
    viewerRolesByPrint(userId, pageIds),
    prisma.printFile.findMany({ where: { printId: { in: pageIds } } }),
  ]);
  const fullById = new Map(full.map((p) => [p.id, p]));
  const filesByPrint = groupByPrintId(files);
  return pageIds.flatMap((id) => {
    const p = fullById.get(id);
    if (!p) return [];
    return [
      printOutFromParts(userId, p, {
        plates: p.plates,
        files: filesByPrint.get(p.id) ?? [],
        previewImages: p.previewImages,
        viewerRole: rolesByPrint.get(p.id),
        category: p.category,
      }),
    ];
  });
}

/** Distinct tags (as typed) of the models the filters match, sorted case-insensitively. */
export async function listTagNames(userId: string, filters: PrintFilters): Promise<string[]> {
  const where = await buildPrintWhere(userId, filters);
  const allRows = await prisma.print.findMany({ where, select: { tags: true } });
  const rows = filters.tags.length ? allRows.filter((r) => matchesTagList(r.tags, filters.tags)) : allRows;
  const found = new Set<string>();
  for (const row of rows) {
    for (const tag of row.tags) {
      const cleaned = tag.trim();
      if (cleaned) found.add(cleaned);
    }
  }
  return [...found].toSorted((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

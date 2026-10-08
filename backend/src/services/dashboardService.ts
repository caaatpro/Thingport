import fs from "node:fs";
import { prisma } from "../db";
import { plateThumbExists, plateThumbPath } from "./printService";

const TOP_MODELS_PREVIEW = 3;
const TOP_MODELS_LIST_MAX = 50;
const TOP_AUTHORS_PREVIEW = 5;
const TOP_AUTHORS_LIST_MAX = 50;
const RECENTLY_ADDED_LIMIT = 8;
const SHELF_LIMIT = 8;

export type DashboardModel = {
  id: string;
  name: string;
  thumbUrl: string | null;
  viewCount: number;
  printCount: number;
  createdAt: Date;
};

export type DashboardAuthor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  modelCount: number;
};

export type DashboardProvider = {
  provider: string;
  modelCount: number;
};

export type DashboardSummary = {
  collectionCount: number;
  modelCount: number;
  authorCount: number;
  categoryCount: number;
  topViewed: DashboardModel[];
  topPrinted: DashboardModel[];
  topAuthors: DashboardAuthor[];
  topProviders: DashboardProvider[];
  recentlyAdded: DashboardModel[];
  recentlyViewed: DashboardModel[];
  favorites: DashboardModel[];
};

type PrintForModelSummary = {
  id: string;
  name: string;
  viewCount: number;
  printCount: number;
  createdAt: Date;
  plates: { id: string }[];
};

function toModelSummary(print: PrintForModelSummary): DashboardModel {
  const plateId = print.plates[0]?.id ?? null;
  let thumbUrl: string | null = null;
  if (plateId && plateThumbExists(plateId)) {
    const mtime = fs.statSync(plateThumbPath(plateId)).mtimeMs;
    thumbUrl = `/plate/${plateId}/thumb.jpg?v=${mtime}`;
  }
  return {
    id: print.id,
    name: print.name,
    thumbUrl,
    viewCount: print.viewCount,
    printCount: print.printCount,
    createdAt: print.createdAt,
  };
}

const MODEL_SUMMARY_SELECT = {
  id: true,
  name: true,
  viewCount: true,
  printCount: true,
  createdAt: true,
  plates: { take: 1, orderBy: { position: "asc" as const }, select: { id: true } },
};

async function fetchTopViewed(userId: string, limit: number): Promise<DashboardModel[]> {
  const prints = await prisma.print.findMany({
    where: { userId, viewCount: { gt: 0 } },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: MODEL_SUMMARY_SELECT,
  });
  return prints.map(toModelSummary);
}

async function fetchTopPrinted(userId: string, limit: number): Promise<DashboardModel[]> {
  const prints = await prisma.print.findMany({
    where: { userId, printCount: { gt: 0 } },
    orderBy: { printCount: "desc" },
    take: limit,
    select: MODEL_SUMMARY_SELECT,
  });
  return prints.map(toModelSummary);
}

async function fetchRecentlyAdded(userId: string, limit: number): Promise<DashboardModel[]> {
  const prints = await prisma.print.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: MODEL_SUMMARY_SELECT,
  });
  return prints.map(toModelSummary);
}

async function fetchRecentlyViewed(userId: string, limit: number): Promise<DashboardModel[]> {
  const prints = await prisma.print.findMany({
    where: { userId, lastViewedAt: { not: null } },
    orderBy: { lastViewedAt: "desc" },
    take: limit,
    select: MODEL_SUMMARY_SELECT,
  });
  return prints.map(toModelSummary);
}

async function fetchFavorites(userId: string, limit: number): Promise<DashboardModel[]> {
  const prints = await prisma.print.findMany({
    where: { userId, favoritedAt: { not: null } },
    orderBy: { favoritedAt: "desc" },
    take: limit,
    select: MODEL_SUMMARY_SELECT,
  });
  return prints.map(toModelSummary);
}

// Sorted in JS: groupBy can't reliably order by an aggregate here.
async function fetchTopAuthors(userId: string, limit: number): Promise<DashboardAuthor[]> {
  const grouped = await prisma.print.groupBy({
    by: ["authorId"],
    where: { userId, authorId: { not: null } },
    _count: true,
  });
  const top = grouped.toSorted((a, b) => b._count - a._count).slice(0, limit);
  if (!top.length) return [];
  const authorIds = top.map((g) => g.authorId as string);
  const authors = await prisma.author.findMany({ where: { id: { in: authorIds } } });
  const byId = new Map(authors.map((a) => [a.id, a]));
  return top
    .map((g) => {
      const author = byId.get(g.authorId as string);
      if (!author) return null;
      return {
        id: author.id,
        name: author.name,
        handle: author.handle,
        avatarUrl: author.avatarUrl,
        modelCount: g._count,
      };
    })
    .filter((a): a is DashboardAuthor => a !== null);
}

async function fetchTopProviders(userId: string): Promise<DashboardProvider[]> {
  const grouped = await prisma.print.groupBy({
    by: ["sourceProvider"],
    where: { userId },
    _count: true,
  });
  const buckets = new Map<string, number>();
  for (const g of grouped) {
    const key = g.sourceProvider ?? "thingport";
    buckets.set(key, (buckets.get(key) ?? 0) + g._count);
  }
  return [...buckets.entries()]
    .map(([provider, modelCount]) => ({ provider, modelCount }))
    .toSorted((a, b) => b.modelCount - a.modelCount);
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [
    collectionCount,
    modelCount,
    authorGroups,
    categoryCount,
    topViewed,
    topPrinted,
    topAuthors,
    topProviders,
    recentlyAdded,
    recentlyViewed,
    favorites,
  ] = await Promise.all([
    prisma.collection.count({ where: { userId } }),
    prisma.print.count({ where: { userId } }),
    prisma.print.groupBy({ by: ["authorId"], where: { userId, authorId: { not: null } } }),
    prisma.category.count({ where: { userId } }),
    fetchTopViewed(userId, TOP_MODELS_PREVIEW),
    fetchTopPrinted(userId, TOP_MODELS_PREVIEW),
    fetchTopAuthors(userId, TOP_AUTHORS_PREVIEW),
    fetchTopProviders(userId),
    fetchRecentlyAdded(userId, RECENTLY_ADDED_LIMIT),
    fetchRecentlyViewed(userId, SHELF_LIMIT),
    fetchFavorites(userId, SHELF_LIMIT),
  ]);

  return {
    collectionCount,
    modelCount,
    authorCount: authorGroups.length,
    categoryCount,
    topViewed,
    topPrinted,
    topAuthors,
    topProviders,
    recentlyAdded,
    recentlyViewed,
    favorites,
  };
}

export function getTopViewedList(userId: string): Promise<DashboardModel[]> {
  return fetchTopViewed(userId, TOP_MODELS_LIST_MAX);
}

export function getTopPrintedList(userId: string): Promise<DashboardModel[]> {
  return fetchTopPrinted(userId, TOP_MODELS_LIST_MAX);
}

export function getTopAuthorsList(userId: string): Promise<DashboardAuthor[]> {
  return fetchTopAuthors(userId, TOP_AUTHORS_LIST_MAX);
}

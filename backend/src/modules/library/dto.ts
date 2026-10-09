import type { Author, Category, Collection, CollectionRole } from "../../generated/prisma/client";
import { accessRoleOf, type AccessRole } from "../../lib/access";
import type { PrintOut } from "../prints/dto";
import type { DashboardAuthor, DashboardModel, DashboardSummary } from "./dashboard";

export type AuthorOut = {
  id: string;
  provider: string;
  external_id: string;
  name: string | null;
  handle: string | null;
  bio: string | null;
  bio_translated: string | null;
  links: string[];
  avatar_url: string | null;
  background_url: string | null;
  // Whether any account has claimed this author. Only GET /author/:id computes it; false elsewhere.
  is_linked: boolean;
};

export function toAuthorOut(author: Author, isLinked = false): AuthorOut {
  return {
    id: author.id,
    provider: author.provider,
    external_id: author.externalId,
    name: author.name,
    handle: author.handle,
    bio: author.bio,
    bio_translated: author.bioTranslated,
    links: author.links,
    avatar_url: author.avatarUrl,
    background_url: author.backgroundUrl,
    is_linked: isLinked,
  };
}

export type CategoryOut = {
  id: string;
  name: string;
  tags: string[];
  parent_id: string | null;
  position: number;
  meta_title: string | null;
  meta_description: string | null;
  // Semicolon-separated, e.g. "800;71;1001"; empty when none.
  makerworld_cat_ids: string;
  thingiverse_cat_ids: string;
  printables_cat_ids: string;
};

export type SystemCollectionKey = "favorites" | "history";

export type CollectionOut = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  item_count: number;
  cover_items: PrintOut[];
  created_at: string;
  /** Set only for the built-in pseudo-collections, which get a translated name and no edit/delete. */
  system_key: SystemCollectionKey | null;
  /** Always false for a system pseudo-collection, which can't be bookmarked. */
  bookmarked: boolean;
  visibility: "private" | "shared";
  is_owner: boolean;
  /** "owner", or the role the owner gave the viewer. */
  my_role: AccessRole;
  owner: { id: string; display_name: string } | null;
  shared_with_count: number;
};

export type CollectionAccessCtx = {
  viewerId?: string;
  shares?: { sharedWithUserId: string; role?: CollectionRole }[];
  owner?: { id: string; display_name: string } | null;
};

/** `coverPrints`: up to 4, in item position order. */
export function toCollectionOut(
  collection: Collection,
  itemCount: number,
  coverPrints: PrintOut[],
  bookmarked: boolean,
  access?: CollectionAccessCtx,
): CollectionOut {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    tags: collection.tags,
    item_count: itemCount,
    cover_items: coverPrints,
    created_at: collection.createdAt.toISOString(),
    system_key: null,
    bookmarked,
    visibility: (access?.shares?.length ?? 0) > 0 ? "shared" : "private",
    is_owner: access?.viewerId ? collection.userId === access.viewerId : true,
    my_role: accessRoleOf(
      access?.viewerId ? collection.userId === access.viewerId : true,
      access?.shares?.find((share) => share.sharedWithUserId === access.viewerId)?.role,
    ),
    owner: access?.viewerId && collection.userId !== access.viewerId ? (access.owner ?? null) : null,
    shared_with_count: access?.shares?.length ?? 0,
  };
}

/** `name` is an untranslated fallback; the frontend translates via `system_key`. */
export function toSystemCollectionOut(
  id: string,
  key: SystemCollectionKey,
  name: string,
  itemCount: number,
  coverPrints: PrintOut[],
): CollectionOut {
  return {
    id,
    name,
    description: null,
    tags: [],
    item_count: itemCount,
    cover_items: coverPrints,
    created_at: new Date(0).toISOString(),
    system_key: key,
    bookmarked: false,
    visibility: "private",
    is_owner: true,
    my_role: "owner",
    owner: null,
    shared_with_count: 0,
  };
}

function formatCatIds(ids: number[]): string {
  return ids.join(";");
}

export function toCategoryOut(category: Category): CategoryOut {
  return {
    id: category.id,
    name: category.name,
    tags: category.tags,
    parent_id: category.parentId,
    position: category.position,
    meta_title: category.metaTitle,
    meta_description: category.metaDescription,
    makerworld_cat_ids: formatCatIds(category.makerworldCatIds),
    thingiverse_cat_ids: formatCatIds(category.thingiverseCatIds),
    printables_cat_ids: formatCatIds(category.printablesCatIds),
  };
}

export function toDashboardModelOut(m: DashboardModel) {
  return {
    id: m.id,
    name: m.name,
    thumb_url: m.thumbUrl,
    view_count: m.viewCount,
    print_count: m.printCount,
    created_at: m.createdAt,
  };
}

export function toDashboardAuthorOut(a: DashboardAuthor) {
  return {
    id: a.id,
    name: a.name,
    handle: a.handle,
    avatar_url: a.avatarUrl,
    model_count: a.modelCount,
  };
}

export function toDashboardSummaryOut(summary: DashboardSummary) {
  return {
    collection_count: summary.collectionCount,
    model_count: summary.modelCount,
    author_count: summary.authorCount,
    category_count: summary.categoryCount,
    top_viewed: summary.topViewed.map(toDashboardModelOut),
    top_printed: summary.topPrinted.map(toDashboardModelOut),
    top_authors: summary.topAuthors.map(toDashboardAuthorOut),
    top_providers: summary.topProviders.map((p) => ({ provider: p.provider, model_count: p.modelCount })),
    recently_added: summary.recentlyAdded.map(toDashboardModelOut),
    recently_viewed: summary.recentlyViewed.map(toDashboardModelOut),
    favorites: summary.favorites.map(toDashboardModelOut),
  };
}

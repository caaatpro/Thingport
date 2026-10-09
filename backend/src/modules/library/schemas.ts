import { z } from "zod";

export const categoryBody = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  parent_id: z.string().nullable().optional(),
});

export const reorderCategoriesBody = z.object({ category_ids: z.array(z.string()).min(1) });

export const moveCategoryBody = z.object({
  parent_id: z.string().nullable(),
  // Index among the new siblings; past the end appends.
  position: z.number().int().min(0),
});

const catIdsField = z.string().trim().max(1000).nullable().optional();

export const categoryMetaBody = z.object({
  meta_title: z.string().trim().max(200).nullable().optional(),
  meta_description: z.string().trim().max(2000).nullable().optional(),
  makerworld_cat_ids: catIdsField,
  thingiverse_cat_ids: catIdsField,
  printables_cat_ids: catIdsField,
});

export const collectionBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export const SHARE_ROLES = ["VIEW", "UPLOAD", "EDIT", "DELETE"] as const;

// `shares` carries a role per person; `user_ids` (everyone read-only) is still accepted.
export const setSharesBody = z.object({
  user_ids: z.array(z.string()).optional(),
  shares: z
    .array(
      z.object({
        user_id: z.string(),
        role: z.enum(SHARE_ROLES.map((r) => r.toLowerCase()) as [string, ...string[]]),
      }),
    )
    .optional(),
});

export const reorderBookmarksBody = z.object({ bookmark_ids: z.array(z.string()).min(1) });

// An unknown or missing sort falls back to "popular" instead of failing the request.
export const tagSummaryQuery = z.object({ sort: z.enum(["popular", "name"]).catch("popular") });

// A blank or missing `q` returns empty results.
export const searchQuery = z.object({ q: z.string().catch("") });

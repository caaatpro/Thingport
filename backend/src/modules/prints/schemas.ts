import { z } from "zod";

/** Query and form values arrive as strings; anything else (repeated keys become arrays) counts as absent. */
/** Zod 4 treats a missing key as invalid for `unknown()`, hence the explicit optional(). */
const loose = z.unknown().optional();
const text = loose.transform((v) => (typeof v === "string" ? v : ""));
const trimmed = text.transform((v) => v.trim());
const list = (separator: string) =>
  text.transform((v) =>
    v
      .split(separator)
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const SELF_AUTHOR_ID = "self";

/** The filters shared by the model list and the tag list. */
export const printFiltersQuery = z.object({
  q: trimmed,
  category_id: list(","),
  collection_id: trimmed,
  author_id: trimmed,
  // "mine" (default), "shared" (shared with me by others) or "all"; favourites/history force "mine".
  scope: loose.transform((v) => (typeof v === "string" ? v : "mine")),
  tags: list(","),
});
export type PrintFilters = z.output<typeof printFiltersQuery>;

export type PrintSortMode = "newest" | "popular" | "downloads";

function intParam(raw: unknown, min: number, max: number): number | null | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export const listPrintsQuery = printFiltersQuery
  .extend({ orderBy: loose, limit: loose, offset: loose })
  .transform(({ orderBy, limit, offset, ...filters }, ctx) => {
    const parsedLimit = intParam(limit, 1, 1000);
    if (parsedLimit === null) {
      ctx.addIssue({ code: "custom", message: "Invalid limit" });
      return z.NEVER;
    }
    const parsedOffset = intParam(offset, 0, Infinity);
    if (parsedOffset === null) {
      ctx.addIssue({ code: "custom", message: "Invalid offset" });
      return z.NEVER;
    }
    const sort: PrintSortMode = orderBy === "popular" || orderBy === "downloads" ? orderBy : "newest";
    return { filters, sort, limit: parsedLimit, offset: parsedOffset };
  });
export type ListPrintsQuery = z.output<typeof listPrintsQuery>;

/** Multipart text fields of POST /upload. */
export const uploadForm = z.preprocess(
  (v) => v ?? {},
  z.object({
    mode: loose.transform((v) => (typeof v === "string" ? v : undefined)),
    title: text,
    notes: text,
    tags: list(","),
    collection_id: trimmed,
    category_id: text,
  }),
);
export type UploadForm = z.output<typeof uploadForm>;

export const tagsBody = z.object({ tags: z.array(z.string()) });

export const metaBody = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  creator: z.string().optional(),
});

export const categoryBody = z.object({ category_id: z.string().nullable().optional() });

export const sharesBody = z.object({ user_ids: z.array(z.string()).default([]) });

export const downloadFilterBody = z.object({
  print_ids: z.array(z.string()).optional(),
  tag: z.string().optional(),
  category_id: z.string().optional(),
  collection_id: z.string().optional(),
});
export const downloadBody = downloadFilterBody.extend({ filename: z.string().optional() });

export const reorderPlatesBody = z.object({ plate_ids: z.array(z.string()).min(1) });
export const renamePlateBody = z.object({ filename: z.string().min(1) });
export const reorderImagesBody = z.object({ image_ids: z.array(z.string()).min(1) });

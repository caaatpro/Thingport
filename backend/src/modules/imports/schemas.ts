import { z } from "zod";

export const importRequestSchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  category_id: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  makerworld_cookie: z.string().nullable().optional(),
  // Resolved by the extension in the page itself. Skips the backend's own resolution, which is
  // what trips MakerWorld's CAPTCHA.
  resolved_download_url: z.string().nullable().optional(),
  resolved_instance_id: z.string().nullable().optional(),
  makerworld_design: z.record(z.string(), z.unknown()).nullable().optional(),
  // Cults3D: title/description/image the extension read off the page.
  page_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  resolved_files: z
    .array(
      z.object({
        url: z.string(),
        filename: z.string().max(255).nullable().optional(),
      }),
    )
    .max(50)
    .nullable()
    .optional(),
});

export const importStatusQuery = z.object({
  url: z.string("url is required").trim().min(1, "url is required"),
});

export const makerworldProfilesImportSchema = importRequestSchema.extend({
  scope: z.enum(["designer", "all"]),
});

export const collectionImportSchema = importRequestSchema.extend({
  design_ids: z.array(z.string()).min(1),
});

export const thingiverseThingsImportSchema = importRequestSchema.extend({
  thing_ids: z.array(z.string()).min(1),
});

export const printablesCollectionImportSchema = importRequestSchema.extend({
  model_ids: z.array(z.string()).min(1),
});

export const zipImportSchema = importRequestSchema.extend({
  entries: z.array(z.string()),
});

export type ImportRequest = z.output<typeof importRequestSchema>;

import fs from "node:fs";
import type {
  Author,
  Category,
  CollectionRole,
  Plate,
  PreviewImage,
  Print,
  PrintFile,
} from "../../generated/prisma/client";
import { accessRoleOf, type AccessRole } from "../../lib/access";
import { plateThumbExists, plateThumbPath } from "./plateThumbnails";
import { previewImageExists, previewImagePath } from "./previewImages";
import { preparedFilename } from "../processing/index";
import { modelPreviewGlbExists, modelPreviewGlbPath } from "../processing/index";
import { buildImportSourceUrl } from "../imports/index";
import { toAuthorOut, type AuthorOut } from "../library/dto";

export type PreparedPrintOut = {
  printer?: string | null;
  material?: string | null;
  nozzle_mm?: number | null;
  layer_height_mm?: number | null;
  estimated_seconds?: number | null;
  format?: string | null;
  removable: boolean;
};

export type PlateOut = {
  id: string;
  print_id: string;
  position: number;
  filename: string;
  mime: string;
  size: number;
  url: string;
  thumb_url: string | null;
  /** Null until generated, and always for non-3MF plates; the viewer then parses the file itself. */
  preview_glb_url: string | null;
  /** Bounding-box size in model units (mm by convention); null for files we haven't measured. */
  dim_mm: { x: number; y: number; z: number } | null;
  triangle_count: number | null;
  /** Background processing state: "queued" | "processing" | "ready" | "failed". */
  processing_status: string;
};

export type PrintFileOut = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
};

export type PreviewImageOut = {
  id: string;
  position: number;
  url: string;
};

export type PrintOut = {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  creator: string | null;
  author: AuthorOut | null;
  tags: string[];
  category_id: string | null;
  // Only populated by the detail fetch; list endpoints skip the join.
  category_name: string | null;
  created_at: string;
  storage_path: string | null;
  plates: PlateOut[];
  preview_images: PreviewImageOut[];
  thumb_url: string | null;
  supporting_file_count: number;
  /** All plates plus supporting and prepared files; gallery images aren't counted. */
  total_size: number;
  prepared_print: PreparedPrintOut | null;
  slicer_url: string | null;
  slicer_filename: string | null;
  view_count: number;
  print_count: number;
  is_favorite: boolean;
  // source_url is the reconstructed original model page.
  source_provider: string | null;
  source_url: string | null;
  // Targeted sharing. "shared" iff the model has a PrintShare or is in a collection that is shared. is_owner is false when the
  // viewer only has shared access; owner is populated only then (so the UI can show "shared by X").
  visibility: "private" | "shared";
  is_owner: boolean;
  /** What the viewer may do: "owner", or their role in a collection that shares this model with them. */
  access_role: AccessRole;
  owner: { id: string; display_name: string } | null;
  shared_with_count: number;
};

export type PrintAccessCtx = {
  viewerId?: string;
  /** The viewer's role through a shared collection; ignored when they own the model. */
  viewerRole?: CollectionRole | null;
  shares?: { sharedWithUserId: string }[];
  /** The model sits in one of the owner's collections that is shared with someone. */
  viaCollection?: boolean;
  owner?: { id: string; display_name: string } | null;
};

function plateThumbUrl(plateId: string): string | null {
  if (!plateThumbExists(plateId)) return null;
  const mtime = fs.statSync(plateThumbPath(plateId)).mtimeMs;
  return `/plate/${plateId}/thumb.jpg?v=${mtime}`;
}

function previewGlbUrl(plate: Plate): string | null {
  if (!modelPreviewGlbExists(plate.id)) {
    // Hand out the URL even with no cache yet: requesting it is what triggers generation.
    return plate.filename.toLowerCase().endsWith(".3mf") ? `/plate/${plate.id}/preview.glb` : null;
  }
  const mtime = fs.statSync(modelPreviewGlbPath(plate.id)).mtimeMs;
  return `/plate/${plate.id}/preview.glb?v=${mtime}`;
}

export function toPlateOut(printId: string, plate: Plate): PlateOut {
  return {
    id: plate.id,
    print_id: printId,
    position: plate.position,
    filename: plate.filename,
    mime: plate.mime,
    size: plate.size,
    url: `/print/${printId}/plate/${plate.id}/file/${encodeURIComponent(plate.filename)}`,
    thumb_url: plateThumbUrl(plate.id),
    preview_glb_url: previewGlbUrl(plate),
    dim_mm:
      plate.dimXmm != null && plate.dimYmm != null && plate.dimZmm != null
        ? { x: plate.dimXmm, y: plate.dimYmm, z: plate.dimZmm }
        : null,
    triangle_count: plate.triangleCount ?? null,
    processing_status: plate.processingStatus.toLowerCase(),
  };
}

function previewImageUrl(id: string): string | null {
  if (!previewImageExists(id)) return null;
  const mtime = fs.statSync(previewImagePath(id)).mtimeMs;
  return `/preview-image/${id}/file.jpg?v=${mtime}`;
}

export function toPreviewImageOut(image: PreviewImage): PreviewImageOut | null {
  const url = previewImageUrl(image.id);
  if (!url) return null;
  return { id: image.id, position: image.position, url };
}

export function toPrintFileOut(printFile: PrintFile): PrintFileOut {
  return {
    id: printFile.id,
    filename: printFile.filename,
    mime: printFile.mime,
    size: printFile.size,
    url: `/print/${printFile.printId}/files/${printFile.id}`,
  };
}

function storageParentDir(plates: Plate[]): string | null {
  if (!plates.length) return null;
  const parts = plates[0].storagePath.split("/");
  parts.pop();
  return parts.join("/") || null;
}

/**
 * `plates` and `previewImages` must be sorted by position ascending.
 */
export function toPrintOut(
  print: Print,
  plates: Plate[],
  files: PrintFile[],
  preparedFile: PrintFile | null,
  author?: Author | null,
  previewImages: PreviewImage[] = [],
  category?: Category | null,
  access?: PrintAccessCtx,
): PrintOut {
  const sortedPlates = plates.toSorted((a, b) => a.position - b.position);
  const plateOuts = sortedPlates.map((p) => toPlateOut(print.id, p));
  const supportingCount = files.filter((f) => f.role === "SUPPORTING").length;
  const totalSize = plates.reduce((sum, p) => sum + p.size, 0) + files.reduce((sum, f) => sum + f.size, 0);
  const previewImageOuts = previewImages
    .toSorted((a, b) => a.position - b.position)
    .map(toPreviewImageOut)
    .filter((img): img is PreviewImageOut => img !== null);

  let prepared: PreparedPrintOut | null = null;
  let slicerUrl: string | null = null;
  let slicerFilename: string | null = null;

  if (preparedFile) {
    const meta = (preparedFile.metadata as Record<string, unknown> | null) || {};
    prepared = {
      printer: (meta.printer as string | null) ?? null,
      material: (meta.material as string | null) ?? null,
      nozzle_mm: (meta.nozzle_mm as number | null) ?? null,
      layer_height_mm: (meta.layer_height_mm as number | null) ?? null,
      estimated_seconds: (meta.estimated_seconds as number | null) ?? null,
      format: (meta.format as string | null) ?? null,
      removable: true,
    };
    slicerUrl = `/print/${print.id}/prepared-print`;
    slicerFilename = preparedFile.filename;
  } else if (print.preparedMetadata) {
    const meta = print.preparedMetadata as Record<string, unknown>;
    prepared = {
      printer: (meta.printer as string | null) ?? null,
      material: (meta.material as string | null) ?? null,
      nozzle_mm: (meta.nozzle_mm as number | null) ?? null,
      layer_height_mm: (meta.layer_height_mm as number | null) ?? null,
      estimated_seconds: (meta.estimated_seconds as number | null) ?? null,
      format: (meta.format as string | null) ?? null,
      removable: false,
    };
    slicerUrl = plateOuts[0]?.url ?? null;
    slicerFilename = preparedFilename(print.name, { format: meta.format as string });
  } else {
    slicerUrl = plateOuts[0]?.url ?? null;
    slicerFilename = sortedPlates[0]?.filename ?? null;
  }

  return {
    id: print.id,
    name: print.name,
    title: print.title,
    notes: print.notes,
    creator: print.creator,
    author: author ? toAuthorOut(author) : null,
    tags: print.tags,
    category_id: print.categoryId,
    // A category is the owner's private filing folder, so it isn't shown to someone it's shared with.
    category_name: access?.viewerId && print.userId !== access.viewerId ? null : (category?.name ?? null),
    created_at: print.createdAt.toISOString(),
    storage_path: storageParentDir(sortedPlates),
    plates: plateOuts,
    preview_images: previewImageOuts,
    thumb_url: plateOuts[0]?.thumb_url ?? null,
    supporting_file_count: supportingCount,
    total_size: totalSize,
    prepared_print: prepared,
    slicer_url: slicerUrl,
    slicer_filename: slicerFilename,
    view_count: print.viewCount,
    print_count: print.printCount,
    is_favorite: print.favoritedAt !== null,
    source_provider: print.sourceProvider,
    source_url: buildImportSourceUrl(print.sourceProvider, print.sourceExternalId),
    visibility: (access?.shares?.length ?? 0) > 0 || access?.viaCollection ? "shared" : "private",
    is_owner: access?.viewerId ? print.userId === access.viewerId : true,
    access_role: accessRoleOf(access?.viewerId ? print.userId === access.viewerId : true, access?.viewerRole),
    owner: access?.viewerId && print.userId !== access.viewerId ? (access.owner ?? null) : null,
    shared_with_count: access?.shares?.length ?? 0,
  };
}

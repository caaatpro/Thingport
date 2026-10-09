import { printsApi, type Plate, type Print } from "@/api/prints";
import { UnauthorizedError } from "@/api/client";

export type ImageItem =
  | { kind: "existing"; id: string; url: string }
  | { kind: "new"; localId: string; file: File; previewUrl: string };

/** `name` is what the file should be called after saving; it starts as the current/selected file name. */
export type PlateItem =
  | { kind: "existing"; id: string; name: string; original: string }
  | { kind: "new"; localId: string; name: string; file: File };

export const imageKey = (img: ImageItem): string => (img.kind === "existing" ? img.id : img.localId);
export const plateKey = (p: PlateItem): string => (p.kind === "existing" ? p.id : p.localId);

export function imageItemsOf(print: Print): ImageItem[] {
  return print.preview_images
    .toSorted((a, b) => a.position - b.position)
    .map((img): ImageItem => ({ kind: "existing", id: img.id, url: img.url }));
}

export function plateItemsOf(print: Print): PlateItem[] {
  return print.plates
    .toSorted((a, b) => a.position - b.position)
    .map((p: Plate): PlateItem => ({ kind: "existing", id: p.id, name: p.filename, original: p.filename }));
}

export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const swapIndex = index + dir;
  if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return list;
  const next = [...list];
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

export type EditValues = {
  title: string;
  notes: string;
  categoryId: string | null;
  tags: string[];
  resetAuthor: boolean;
  images: ImageItem[];
  plates: PlateItem[];
};

export function initialValues(print: Print): EditValues {
  return {
    title: print.title || print.name,
    notes: print.notes ?? "",
    categoryId: print.category_id ?? null,
    tags: print.tags,
    resetAuthor: false,
    images: imageItemsOf(print),
    plates: plateItemsOf(print),
  };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** What differs from the saved print. Drives the "discard changes?" prompt and which requests are sent. */
export function changesOf(print: Print, values: EditValues, isOwner: boolean) {
  const base = initialValues(print);
  return {
    meta: values.title.trim() !== base.title || values.notes !== base.notes,
    category: isOwner && values.categoryId !== base.categoryId,
    tags: !sameList(values.tags, base.tags),
    author: isOwner && values.resetAuthor,
    images:
      !sameList(values.images.map(imageKey), base.images.map(imageKey)) ||
      values.images.some((img) => img.kind === "new"),
    plates:
      !sameList(values.plates.map(plateKey), base.plates.map(plateKey)) ||
      values.plates.some((p) => p.kind === "new" || p.name.trim() !== p.original),
  };
}

export const isDirty = (print: Print, values: EditValues, isOwner: boolean) =>
  Object.values(changesOf(print, values, isOwner)).some(Boolean);

/** Why the form can't be saved yet, or null. */
export function validate(values: EditValues): { title?: string; plates?: string } {
  const errors: { title?: string; plates?: string } = {};
  if (!values.title.trim()) errors.title = "Enter a title.";
  if (values.plates.length === 0) errors.plates = "A model needs at least one file.";
  else if (values.plates.some((p) => !p.name.trim())) errors.plates = "File names can't be empty.";
  return errors;
}

type SaveContext = {
  /** The newest print the server has returned; kept current so a failure part-way can still refresh the page. */
  latest: Print;
  /** Set when only the preview images failed: the rest of the save went through. */
  previewError: string | null;
  skippedImages: number;
};

/**
 * Commits the staged edits. Order matters: preview images are isolated so one bad image can't stop the model
 * files from saving; new files are uploaded before removed ones are deleted so a model's only file can be
 * swapped in one save. A failure throws, but `ctx.latest` already holds everything that was saved.
 */
export async function saveModelEdits(
  print: Print,
  values: EditValues,
  isOwner: boolean,
  ctx: SaveContext,
  fallbackPreviewError = "Your other changes were saved, but the preview images couldn't be updated.",
): Promise<void> {
  const change = changesOf(print, values, isOwner);

  if (change.meta) {
    const res = await printsApi.updateMeta(print.id, { title: values.title.trim(), notes: values.notes });
    ctx.latest = res.print ?? ctx.latest;
  }
  // Category and author belong to the owner; the server refuses them from anyone else.
  if (change.category) {
    const res = await printsApi.updateCategory(print.id, values.categoryId);
    ctx.latest = res.print ?? ctx.latest;
  }
  if (change.tags) {
    const res = await printsApi.setTags(print.id, values.tags);
    ctx.latest = res.print ?? ctx.latest;
  }
  if (change.author) {
    const res = await printsApi.resetAuthor(print.id);
    ctx.latest = res.print ?? ctx.latest;
  }

  if (change.images) {
    try {
      await saveImages(print, values, ctx);
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      console.error(err);
      ctx.previewError = err instanceof Error && err.message ? err.message : fallbackPreviewError;
    }
  }

  if (change.plates) await savePlates(print, values, ctx);
}

async function saveImages(print: Print, values: EditValues, ctx: SaveContext) {
  const keptIds = new Set(values.images.filter((i) => i.kind === "existing").map((i) => i.id));
  // Removals are explicit, not diffed against the server's list: a new upload's thumbnail may still be
  // generating, and a diff would delete it the moment it appeared.
  for (const original of print.preview_images) {
    if (keptIds.has(original.id)) continue;
    const res = await printsApi.deletePreviewImage(print.id, original.id);
    ctx.latest = res.print ?? ctx.latest;
  }
  const newFiles = values.images.filter((i) => i.kind === "new").map((i) => i.file);
  let newIdsInOrder: string[] = [];
  if (newFiles.length) {
    const before = new Set(ctx.latest.preview_images.map((i) => i.id));
    const res = await printsApi.addPreviewImages(print.id, newFiles);
    ctx.latest = res.print;
    newIdsInOrder = ctx.latest.preview_images
      .filter((i) => !before.has(i.id))
      .toSorted((a, b) => a.position - b.position)
      .map((i) => i.id);
    // The server silently skips images it can't decode; never let a missing id reach the reorder (it 400s).
    ctx.skippedImages = Math.max(0, newFiles.length - newIdsInOrder.length);
  }
  if (!values.images.length) return;
  let nextNew = 0;
  const known = values.images
    .map((img) => (img.kind === "existing" ? img.id : newIdsInOrder[nextNew++]))
    .filter((id): id is string => Boolean(id));
  // The reorder needs every id; images this form never saw go last, in their order.
  const knownSet = new Set(known);
  const unknown = ctx.latest.preview_images
    .filter((i) => !knownSet.has(i.id))
    .toSorted((a, b) => a.position - b.position)
    .map((i) => i.id);
  const finalOrder = [...known, ...unknown];
  if (finalOrder.length) {
    const res = await printsApi.reorderPreviewImages(print.id, finalOrder);
    ctx.latest = res.print ?? ctx.latest;
  }
}

async function savePlates(print: Print, values: EditValues, ctx: SaveContext) {
  const newItems = values.plates.filter((p) => p.kind === "new");
  let newIdsInOrder: string[] = [];
  if (newItems.length) {
    const before = new Set(ctx.latest.plates.map((p) => p.id));
    const res = await printsApi.addPlates(
      print.id,
      newItems.map((p) => p.file),
    );
    ctx.latest = res.print;
    newIdsInOrder = ctx.latest.plates
      .filter((p) => !before.has(p.id))
      .toSorted((a, b) => a.position - b.position)
      .map((p) => p.id);
  }
  const keptIds = new Set(values.plates.filter((p) => p.kind === "existing").map((p) => p.id));
  for (const original of print.plates) {
    if (keptIds.has(original.id)) continue;
    const res = await printsApi.deletePlate(print.id, original.id);
    ctx.latest = res.print ?? ctx.latest;
  }
  // Resolve every row to a real plate id, then rename whatever isn't called what the user wants. This also
  // undoes the " (2)" suffix a replaced file got while its predecessor still existed.
  let nextNew = 0;
  const resolved = values.plates.map((p) => ({ id: p.kind === "existing" ? p.id : newIdsInOrder[nextNew++], name: p.name.trim() }));
  for (const { id, name } of resolved) {
    if (!id) continue;
    const current = ctx.latest.plates.find((p) => p.id === id);
    if (!current || current.filename === name) continue;
    const res = await printsApi.renamePlate(print.id, id, name);
    ctx.latest = res.print ?? ctx.latest;
  }
  const order = resolved.map((r) => r.id).filter((id): id is string => Boolean(id));
  const currentOrder = ctx.latest.plates.toSorted((a, b) => a.position - b.position).map((p) => p.id);
  if (!sameList(order, currentOrder)) {
    const res = await printsApi.reorderPlates(print.id, order);
    ctx.latest = res.print ?? ctx.latest;
  }
}

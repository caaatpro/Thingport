import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Print } from "@/api/prints";
import { makePrint } from "@/features/prints/testUtils";
import type { AnyFn } from "@/test/types";
import {
  changesOf,
  initialValues,
  moveItem,
  saveModelEdits,
  type EditValues,
  type ImageItem,
  type PlateItem,
} from "./editModel";

const api = vi.hoisted(() => ({
  updateMeta: vi.fn<AnyFn>(),
  updateCategory: vi.fn<AnyFn>(),
  setTags: vi.fn<AnyFn>(),
  resetAuthor: vi.fn<AnyFn>(),
  addPreviewImages: vi.fn<AnyFn>(),
  deletePreviewImage: vi.fn<AnyFn>(),
  reorderPreviewImages: vi.fn<AnyFn>(),
  addPlates: vi.fn<AnyFn>(),
  deletePlate: vi.fn<AnyFn>(),
  renamePlate: vi.fn<AnyFn>(),
  reorderPlates: vi.fn<AnyFn>(),
}));
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, ...api } };
});

const plate = (id: string, filename: string, position: number) => ({
  id,
  print_id: "p1",
  position,
  filename,
  mime: "m",
  size: 1,
  url: `/p/${id}`,
});
const image = (id: string, position: number) => ({ id, position, url: `/i/${id}` });
const ctxOf = (print: Print) => ({ latest: print, previewError: null as string | null, skippedImages: 0 });

beforeEach(() => vi.resetAllMocks());

describe("moveItem", () => {
  it("swaps neighbours and ignores moves off the ends", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    const list = [1, 2];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });
});

describe("changesOf", () => {
  const print = makePrint({ plates: [plate("a", "a.stl", 0)], preview_images: [image("i1", 0)] });
  it("sees nothing in an untouched form", () => {
    expect(Object.values(changesOf(print, initialValues(print), true)).some(Boolean)).toBe(false);
  });
  it("ignores category and author for a non-owner", () => {
    const values = { ...initialValues(print), categoryId: "c1", resetAuthor: true };
    expect(changesOf(print, values, false)).toMatchObject({ category: false, author: false });
    expect(changesOf(print, values, true)).toMatchObject({ category: true, author: true });
  });
  it("sees a rename and a reordered image", () => {
    const base = initialValues(print);
    expect(changesOf(print, { ...base, plates: [{ ...base.plates[0], name: "b.stl" }] }, true).plates).toBe(true);
    const two = makePrint({ preview_images: [image("i1", 0), image("i2", 1)] });
    const v = initialValues(two);
    expect(changesOf(two, { ...v, images: v.images.toReversed() }, true).images).toBe(true);
  });
});

describe("saveModelEdits", () => {
  it("replaces the only file in one save, then renames away the ' (2)' suffix", async () => {
    const print = makePrint({ plates: [plate("old", "part.stl", 0)] });
    const uploaded = makePrint({ plates: [plate("old", "part.stl", 0), plate("new", "part (2).stl", 1)] });
    const afterDelete = makePrint({ plates: [plate("new", "part (2).stl", 0)] });
    const renamed = makePrint({ plates: [plate("new", "part.stl", 0)] });
    api.addPlates.mockResolvedValue({ print: uploaded });
    api.deletePlate.mockResolvedValue({ print: afterDelete });
    api.renamePlate.mockResolvedValue({ print: renamed });
    const file = new File(["x"], "part.stl");
    const values: EditValues = {
      ...initialValues(print),
      plates: [{ kind: "new", localId: "l1", file, name: "part.stl" }],
    };
    const ctx = ctxOf(print);
    await saveModelEdits(print, values, true, ctx);
    expect(api.addPlates).toHaveBeenCalledWith("p1", [file]);
    expect(api.deletePlate).toHaveBeenCalledWith("p1", "old");
    expect(api.renamePlate).toHaveBeenCalledWith("p1", "new", "part.stl");
    expect(api.addPlates.mock.invocationCallOrder[0]).toBeLessThan(api.deletePlate.mock.invocationCallOrder[0]);
    expect(ctx.latest).toBe(renamed);
  });

  it("renames an existing file and reorders", async () => {
    const print = makePrint({ plates: [plate("a", "a.stl", 0), plate("b", "b.stl", 1)] });
    api.renamePlate.mockResolvedValue({
      print: makePrint({ plates: [plate("a", "a.stl", 0), plate("b", "c.stl", 1)] }),
    });
    api.reorderPlates.mockResolvedValue({ print });
    const base = initialValues(print);
    const plates: PlateItem[] = [{ ...base.plates[1], name: "c.stl" }, base.plates[0]];
    await saveModelEdits(print, { ...base, plates }, true, ctxOf(print));
    expect(api.renamePlate).toHaveBeenCalledWith("p1", "b", "c.stl");
    expect(api.reorderPlates).toHaveBeenCalledWith("p1", ["b", "a"]);
  });

  it("keeps going after a preview failure and remembers why", async () => {
    const print = makePrint({ plates: [plate("a", "a.stl", 0)] });
    api.addPreviewImages.mockRejectedValue(new Error("Too big"));
    const newImage: ImageItem = { kind: "new", localId: "l", file: new File(["x"], "p.png"), previewUrl: "blob:x" };
    const base = initialValues(print);
    const ctx = ctxOf(print);
    api.updateMeta.mockResolvedValue({ print });
    await saveModelEdits(print, { ...base, title: "New", images: [newImage] }, true, ctx);
    expect(ctx.previewError).toBe("Too big");
    expect(api.updateMeta).toHaveBeenCalled();
  });

  it("counts images the server skipped and never reorders with a missing id", async () => {
    const print = makePrint({ plates: [plate("a", "a.stl", 0)], preview_images: [image("i1", 0)] });
    api.addPreviewImages.mockResolvedValue({ print: makePrint({ preview_images: [image("i1", 0)] }) });
    api.reorderPreviewImages.mockResolvedValue({ print });
    const base = initialValues(print);
    const newImage: ImageItem = { kind: "new", localId: "l", file: new File(["x"], "p.png"), previewUrl: "blob:x" };
    const ctx = ctxOf(print);
    await saveModelEdits(print, { ...base, images: [...base.images, newImage] }, true, ctx);
    expect(ctx.skippedImages).toBe(1);
    expect(api.reorderPreviewImages).toHaveBeenCalledWith("p1", ["i1"]);
  });

  it("deletes removed preview images", async () => {
    const print = makePrint({ plates: [plate("a", "a.stl", 0)], preview_images: [image("i1", 0), image("i2", 1)] });
    api.deletePreviewImage.mockResolvedValue({ print: makePrint({ preview_images: [image("i2", 0)] }) });
    api.reorderPreviewImages.mockResolvedValue({ print });
    const base = initialValues(print);
    await saveModelEdits(print, { ...base, images: [base.images[1]] }, true, ctxOf(print));
    expect(api.deletePreviewImage).toHaveBeenCalledWith("p1", "i1");
    expect(api.reorderPreviewImages).toHaveBeenCalledWith("p1", ["i2"]);
  });
});

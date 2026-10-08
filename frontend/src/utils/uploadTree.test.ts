import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../api/client";
import type { AnyFn } from "../test/types";

const categoriesApi = vi.hoisted(() => ({ list: vi.fn<AnyFn>(), create: vi.fn<AnyFn>() }));
const printsApi = vi.hoisted(() => ({ upload: vi.fn<AnyFn>() }));
vi.mock("../api/categories", () => ({ categoriesApi }));
vi.mock("../api/prints", () => ({ printsApi }));

const { entriesFromDataTransfer, entriesFromFileList, uploadEntriesToCategory } = await import("./uploadTree");

const file = (name: string) => new File(["x"], name);
const entry = (relativePath: string) => ({ file: file(relativePath.split("/").pop()!), relativePath });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  categoriesApi.list.mockResolvedValue([]);
  let n = 0;
  categoriesApi.create.mockImplementation(async (name: string) => ({ id: `cat-${name}-${++n}` }));
  printsApi.upload.mockImplementation(async (files: File[]) => ({ prints: files.map((f) => ({ id: `p-${f.name}` })) }));
});

const leaf = (name: string) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok: (f: File) => void) => ok(file(name)),
});
const dir = (name: string, children: unknown[]) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let done = false;
    return {
      readEntries: (ok: (e: unknown[]) => void) => {
        ok(done ? [] : children);
        done = true;
      },
    };
  },
});

describe("entriesFromFileList", () => {
  it("uses the folder-relative path when the browser provides one", () => {
    const f = file("a.stl");
    Object.defineProperty(f, "webkitRelativePath", { value: "Pack\\sub/a.stl" });
    expect(entriesFromFileList([f])).toEqual([{ file: f, relativePath: "Pack/sub/a.stl" }]);
  });

  it("falls back to the file name", () => {
    const f = file("lone.stl");
    expect(entriesFromFileList([f])[0].relativePath).toBe("lone.stl");
  });
});

describe("entriesFromDataTransfer", () => {
  it("walks dropped folders recursively", async () => {
    const tree = dir("Pack", [leaf("a.stl"), dir("sub", [leaf("b.stl")])]);
    const dt = { items: [{ kind: "file", webkitGetAsEntry: () => tree }], files: [] } as unknown as DataTransfer;
    const paths = (await entriesFromDataTransfer(dt)).map((e) => e.relativePath).toSorted();
    expect(paths).toEqual(["Pack/a.stl", "Pack/sub/b.stl"]);
  });

  it("uses plain files when the browser has no entry API", async () => {
    const f = file("x.stl");
    const dt = { items: [{ kind: "file", getAsFile: () => f }], files: [f] } as unknown as DataTransfer;
    expect((await entriesFromDataTransfer(dt))[0].relativePath).toBe("x.stl");
  });
});

describe("uploadEntriesToCategory", () => {
  it("uploads loose files straight into the target category without creating folders", async () => {
    const res = await uploadEntriesToCategory([entry("a.stl"), entry("b.stl")], "target");
    expect(categoriesApi.create).not.toHaveBeenCalled();
    expect(printsApi.upload).toHaveBeenCalledTimes(2);
    expect(printsApi.upload).toHaveBeenCalledWith(expect.any(Array), { category_id: "target" });
    expect(res.uploaded).toBe(2);
    expect(res.failed).toEqual([]);
  });

  it("creates one category per folder and nests them", async () => {
    await uploadEntriesToCategory([entry("Pack/sub/a.stl")], null);
    expect(categoriesApi.create).toHaveBeenNthCalledWith(1, "Pack", [], undefined);
    expect(categoriesApi.create).toHaveBeenNthCalledWith(2, "sub", [], expect.stringContaining("cat-Pack"));
    expect(printsApi.upload).toHaveBeenCalledWith(expect.any(Array), {
      category_id: expect.stringContaining("cat-sub"),
    });
  });

  it("creates a shared folder only once for several files", async () => {
    await uploadEntriesToCategory([entry("Pack/a.stl"), entry("Pack/b.stl")], null);
    expect(categoriesApi.create).toHaveBeenCalledTimes(1);
  });

  it("reuses a same-named category in the same place so re-uploading a tree doesn't duplicate it", async () => {
    categoriesApi.list.mockResolvedValue([{ id: "existing", name: "Pack", parent_id: null }]);
    await uploadEntriesToCategory([entry("Pack/a.stl")], null);
    expect(categoriesApi.create).not.toHaveBeenCalled();
    expect(printsApi.upload).toHaveBeenCalledWith(expect.any(Array), { category_id: "existing" });
  });

  it("reports a failed upload with its reason and carries on with the rest", async () => {
    printsApi.upload.mockImplementationOnce(async () => {
      throw new Error("File too large");
    });
    const res = await uploadEntriesToCategory([entry("big.stl"), entry("ok.stl")], null);
    expect(res.failed).toEqual(["big.stl (File too large)"]);
    expect(res.uploaded).toBe(1);
  });

  it("skips a file whose folder could not be created", async () => {
    categoriesApi.create.mockRejectedValueOnce(new Error("boom"));
    const res = await uploadEntriesToCategory([entry("Bad/a.stl"), entry("fine.stl")], null);
    expect(res.failed).toEqual(["a.stl"]);
    expect(res.uploaded).toBe(1);
  });

  it("stops and signs out on 401 instead of failing every remaining file", async () => {
    printsApi.upload.mockRejectedValue(new UnauthorizedError());
    const onUnauthorized = vi.fn<AnyFn>();
    const res = await uploadEntriesToCategory([entry("a.stl"), entry("b.stl"), entry("c.stl")], null, onUnauthorized);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(printsApi.upload).toHaveBeenCalledTimes(1);
    expect(res.uploaded).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import type { ImportJob } from "@/api/imports";
import {
  isFlatFileSet,
  jobBreakdown,
  jobCompletionMessage,
  jobProgressPercent,
  jobResultLink,
  resolveImportTarget,
  splitZips,
} from "./logic";

const job = (patch: Partial<ImportJob> = {}): ImportJob => ({
  id: "j1",
  type: "ZIP",
  status: "DONE",
  source_url: "https://example.com/a.zip",
  source_label: null,
  provider: null,
  total: 4,
  processed: 4,
  imported: 4,
  already_in_library: 0,
  failed_count: 0,
  error_message: null,
  result_collection_id: null,
  result_print_id: null,
  ...patch,
});

const file = (name: string) => ({ name }) as File;

describe("resolveImportTarget", () => {
  it("reads the category from /models", () => {
    expect(resolveImportTarget("/models", "?category=c1&sort=popular")).toEqual({
      categoryId: "c1",
      collectionId: null,
    });
  });
  it("ignores the category param outside the library", () => {
    expect(resolveImportTarget("/tags", "?category=c1")).toEqual({ categoryId: null, collectionId: null });
  });
  it("reads a collection id and drops the category", () => {
    expect(resolveImportTarget("/models/collections/abc%20d", "?category=c1")).toEqual({
      categoryId: null,
      collectionId: "abc d",
    });
  });
  it("treats favorites and history as no target", () => {
    expect(resolveImportTarget("/models/collections/favorites", "")).toEqual({ categoryId: null, collectionId: null });
    expect(resolveImportTarget("/models/collections/history", "")).toEqual({ categoryId: null, collectionId: null });
  });
});

describe("upload sets", () => {
  it("flags only loose multi-file picks, not folders or single files", () => {
    const loose = [
      { file: file("a.stl"), relativePath: "a.stl" },
      { file: file("b.stl"), relativePath: "b.stl" },
    ];
    expect(isFlatFileSet(loose)).toBe(true);
    expect(isFlatFileSet(loose.slice(0, 1))).toBe(false);
    expect(isFlatFileSet([...loose, { file: file("c.stl"), relativePath: "dir/c.stl" }])).toBe(false);
  });
  it("splits zips from other files case-insensitively, keeping order", () => {
    const entries = [{ file: file("a.stl") }, { file: file("B.ZIP") }, { file: file("c.3mf") }];
    const { normal, zips } = splitZips(entries);
    expect(normal.map((e) => e.file.name)).toEqual(["a.stl", "c.3mf"]);
    expect(zips.map((e) => e.file.name)).toEqual(["B.ZIP"]);
  });
});

describe("import jobs", () => {
  it("links a single result to the model, a collection to the collection, several to the library", () => {
    expect(jobResultLink(job({ result_print_id: "p1" }))?.to).toBe("/models/p1");
    expect(jobResultLink(job({ result_collection_id: "c9" }))?.to).toBe("/models/collections/c9");
    expect(jobResultLink(job())?.to).toBe("/models");
    expect(jobResultLink(job({ imported: 0, already_in_library: 0 }))).toBeNull();
    expect(jobResultLink(job({ status: "ERROR", result_print_id: "p1" }))).toBeNull();
  });
  it("computes progress, unknown until a total exists", () => {
    expect(jobProgressPercent({ total: 0, processed: 0 })).toBeNull();
    expect(jobProgressPercent({ total: 4, processed: 1 })).toBe(25);
    expect(jobProgressPercent({ total: 4, processed: 9 })).toBe(100);
  });
  it("describes outcomes without zero parts", () => {
    expect(jobBreakdown(job({ imported: 2, already_in_library: 0, failed_count: 1 }))).toBe("2 imported, 1 failed");
    expect(jobCompletionMessage(job({ imported: 3 }))).toEqual({
      tone: "success",
      message: "Import complete: 3 imported.",
    });
    expect(jobCompletionMessage(job({ imported: 3, failed_count: 1 })).tone).toBe("warning");
    expect(jobCompletionMessage(job({ imported: 0, already_in_library: 2 })).message).toContain(
      "already in your library",
    );
    expect(jobCompletionMessage(job({ status: "ERROR", error_message: "Boom" }))).toEqual({
      tone: "error",
      message: "Boom",
    });
  });
});

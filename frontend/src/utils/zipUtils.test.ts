import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildUploadEntriesFromZip, guessMimeType, isZipFile, normalizeZipPath, readZipEntries } from "./zipUtils";

describe("normalizeZipPath", () => {
  it("cleans separators and leading slashes", () => {
    expect(normalizeZipPath("a\\b/c.stl")).toBe("a/b/c.stl");
    expect(normalizeZipPath("/a//b.stl")).toBe("a/b.stl");
  });

  it("rejects directories, empty paths and path traversal", () => {
    expect(normalizeZipPath("folder/")).toBeNull();
    expect(normalizeZipPath("")).toBeNull();
    expect(normalizeZipPath("../evil.stl")).toBeNull();
    expect(normalizeZipPath("a/../../evil.stl")).toBeNull();
  });
});

describe("guessMimeType / isZipFile", () => {
  it("maps the formats the library knows and is empty otherwise", () => {
    expect(guessMimeType("A.STL")).toBe("model/stl");
    expect(guessMimeType("x.3mf")).toBe("model/3mf");
    expect(guessMimeType("p.jpeg")).toBe("image/jpeg");
    expect(guessMimeType("notes.txt")).toBe("");
    expect(guessMimeType("noext")).toBe("");
  });

  it("spots zip files by name", () => {
    expect(isZipFile("Pack.ZIP")).toBe(true);
    expect(isZipFile("pack.zip.stl")).toBe(false);
  });
});

describe("reading a zip and building upload entries", () => {
  const archive = zipSync({
    "box.stl": new TextEncoder().encode("solid box"),
    "parts/lid.stl": new TextEncoder().encode("solid lid"),
    "parts/notes.txt": new TextEncoder().encode("hello"),
  });
  const zipFile = new File([archive as Uint8Array<ArrayBuffer>], "pack.zip");

  it("lists entries sorted by path with their sizes", async () => {
    const { entries } = await readZipEntries(zipFile);
    expect(entries.map((e) => e.path)).toEqual(["box.stl", "parts/lid.stl", "parts/notes.txt"]);
    expect(entries[0].size).toBe("solid box".length);
  });

  it("builds files with guessed types and keeps folders under the base path", async () => {
    const { data } = await readZipEntries(zipFile);
    const built = buildUploadEntriesFromZip(data, ["parts/lid.stl", "box.stl"], "Pack");
    expect(built.map((e) => e.relativePath)).toEqual(["Pack/parts/lid.stl", "Pack/box.stl"]);
    expect(built[0].file.name).toBe("lid.stl");
    expect(built[0].file.type).toBe("model/stl");
  });

  it("skips duplicates, unknown and unsafe selections", async () => {
    const { data } = await readZipEntries(zipFile);
    const built = buildUploadEntriesFromZip(data, ["box.stl", "box.stl", "missing.stl", "../box.stl"]);
    expect(built.map((e) => e.relativePath)).toEqual(["box.stl"]);
  });
});

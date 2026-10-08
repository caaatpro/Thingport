import { describe, expect, it } from "vitest";
import { extOf, stemOf } from "./fileExtensions";

describe("extOf", () => {
  it("lowercases and drops the dot", () => {
    expect(extOf("Model.STL")).toBe("stl");
    expect(extOf("archive.tar.gz")).toBe("gz");
  });
  it("is empty without an extension or for empty input", () => {
    expect(extOf("README")).toBe("");
    expect(extOf("")).toBe("");
    expect(extOf(undefined as unknown as string)).toBe("");
  });
});

describe("stemOf", () => {
  it("removes only the last extension", () => {
    expect(stemOf("benchy.3mf")).toBe("benchy");
    expect(stemOf("archive.tar.gz")).toBe("archive.tar");
  });
  it("keeps a name with nothing before the dot whole", () => {
    expect(stemOf(".stl")).toBe(".stl");
  });
  it("handles names without an extension and empty input", () => {
    expect(stemOf("README")).toBe("README");
    expect(stemOf("")).toBe("");
  });
});

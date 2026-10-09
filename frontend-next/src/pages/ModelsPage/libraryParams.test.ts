import { describe, expect, it } from "vitest";
import { categoryHref, readLibraryParams, withLibraryParams } from "./libraryParams";

const q = (s: string) => new URLSearchParams(s);

describe("library URL state", () => {
  it("defaults to newest / mine / no category and ignores junk", () => {
    expect(readLibraryParams(q(""))).toEqual({ category: null, sort: "newest", scope: "mine" });
    expect(readLibraryParams(q("sort=bogus&scope=nope"))).toEqual({ category: null, sort: "newest", scope: "mine" });
  });

  it("reads sort, scope and category, and the legacy orderBy", () => {
    expect(readLibraryParams(q("category=c1&sort=popular&scope=shared"))).toEqual({ category: "c1", sort: "popular", scope: "shared" });
    expect(readLibraryParams(q("orderBy=downloads")).sort).toBe("downloads");
  });

  it("drops defaults from the URL and migrates orderBy", () => {
    expect(withLibraryParams(q("orderBy=popular&scope=all"), { scope: "mine" }).toString()).toBe("sort=popular");
    expect(withLibraryParams(q("sort=popular"), { sort: "newest" }).toString()).toBe("");
  });

  it("keeps other params untouched", () => {
    expect(withLibraryParams(q("foo=1"), { category: "c2" }).toString()).toBe("foo=1&category=c2");
  });

  it("builds category links that keep sort and scope", () => {
    expect(categoryHref(q("sort=popular&scope=shared&category=a"), "b")).toBe("/models?sort=popular&scope=shared&category=b");
    expect(categoryHref(q("sort=popular&category=a"), null)).toBe("/models?sort=popular");
    expect(categoryHref(q("category=a"), null)).toBe("/models");
  });
});

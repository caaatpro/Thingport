import { describe, expect, it } from "vitest";
import {
  IMPORT_LINK_EXAMPLES,
  detectImportProvider,
  isMakerworldCollectionUrl,
  isMakerworldModelUrl,
  isPrintablesCollectionUrl,
  isPrintablesModelUrl,
  isThingiverseCollectionUrl,
  isThingiverseLikesUrl,
  isThingiverseThingUrl,
} from "./importLinkDetection";

describe("detectImportProvider", () => {
  it.each([
    ["https://makerworld.com/en/models/123-box", "makerworld"],
    ["https://www.thingiverse.com/thing:42", "thingiverse"],
    ["https://www.printables.com/model/9-x", "printables"],
    ["printables.com/model/9-x", "printables"],
  ])("recognises %s", (url, provider) => {
    expect(detectImportProvider(url)).toBe(provider);
  });

  it("returns null for other sites and for junk", () => {
    expect(detectImportProvider("https://example.com/model/1")).toBeNull();
    expect(detectImportProvider("not a url at all")).toBeNull();
    expect(detectImportProvider("")).toBeNull();
  });

  it("does not take a lookalike Thingiverse or Printables host for the real one", () => {
    expect(detectImportProvider("https://thingiverse.com.evil.example/thing:1")).toBeNull();
    expect(detectImportProvider("https://evilprintables.com/model/1")).toBeNull();
  });
});

describe("page-shape checks", () => {
  it("MakerWorld models and collections", () => {
    expect(isMakerworldModelUrl("https://makerworld.com/ru/models/2875294-free-box#profileId-1")).toBe(true);
    expect(isMakerworldModelUrl("https://makerworld.com/en/collections/12-x")).toBe(false);
    expect(isMakerworldCollectionUrl("https://makerworld.com/en/collections/12-x")).toBe(true);
    expect(isMakerworldCollectionUrl("https://makerworld.com/en/models/1")).toBe(false);
  });

  it("Thingiverse things, likes and collections", () => {
    expect(isThingiverseThingUrl("https://www.thingiverse.com/thing:123")).toBe(true);
    expect(isThingiverseThingUrl("https://www.thingiverse.com/things/123")).toBe(true);
    expect(isThingiverseThingUrl("https://www.thingiverse.com/maker/designs")).toBe(false);
    expect(isThingiverseLikesUrl("https://www.thingiverse.com/maker/likes")).toBe(true);
    expect(isThingiverseLikesUrl("https://www.thingiverse.com/maker/likes/extra")).toBe(false);
    expect(isThingiverseCollectionUrl("https://www.thingiverse.com/maker/collections/55-stuff")).toBe(true);
  });

  it("Printables models and collections", () => {
    expect(isPrintablesModelUrl("https://www.printables.com/model/123-benchy")).toBe(true);
    expect(isPrintablesModelUrl("https://www.printables.com/@maker/collections/9-x")).toBe(false);
    expect(isPrintablesCollectionUrl("https://www.printables.com/@maker/collections/9-x")).toBe(true);
  });

  it("the example links match their own detectors", () => {
    expect(isMakerworldModelUrl(IMPORT_LINK_EXAMPLES.makerworld.model)).toBe(true);
    expect(isMakerworldCollectionUrl(IMPORT_LINK_EXAMPLES.makerworld.collection)).toBe(true);
    expect(isThingiverseThingUrl(IMPORT_LINK_EXAMPLES.thingiverse.model)).toBe(true);
    expect(isThingiverseCollectionUrl(IMPORT_LINK_EXAMPLES.thingiverse.collection)).toBe(true);
    expect(isPrintablesModelUrl(IMPORT_LINK_EXAMPLES.printables.model)).toBe(true);
    expect(isPrintablesCollectionUrl(IMPORT_LINK_EXAMPLES.printables.collection)).toBe(true);
  });
});

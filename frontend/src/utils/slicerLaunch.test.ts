import { describe, expect, it } from "vitest";
import { isBridgedSlicer, slicerLaunchUrl } from "./slicerLaunch";

describe("isBridgedSlicer", () => {
  it("knows which slicers go through the Thingport Bridge", () => {
    for (const id of ["bambustudio", "prusaslicer", "cura", "anycubicslicernext"])
      expect(isBridgedSlicer(id)).toBe(true);
    for (const id of ["orcaslicer", "elegooslicer", "other"]) expect(isBridgedSlicer(id)).toBe(false);
  });
});

describe("slicerLaunchUrl", () => {
  it("hands bridged slicers to the thingport:// protocol with the file and slicer", () => {
    const url = new URL(slicerLaunchUrl("bambustudio", "https://host/api/plate/1/file/x.3mf", "x.3mf"));
    expect(url.protocol).toBe("thingport:");
    expect(url.searchParams.get("url")).toBe("https://host/api/plate/1/file/x.3mf");
    expect(url.searchParams.get("slicer")).toBe("bambustudio");
    expect(url.searchParams.get("filename")).toBe("x.3mf");
  });

  it("omits the filename for bridged slicers when none is given", () => {
    const url = new URL(slicerLaunchUrl("cura", "https://host/f.stl"));
    expect(url.searchParams.has("filename")).toBe(false);
  });

  it("opens direct slicers by their own protocol with an encoded file URL", () => {
    expect(slicerLaunchUrl("orcaslicer", "https://host/a b.3mf")).toBe(
      `orcaslicer://open?file=${encodeURIComponent("https://host/a b.3mf")}`,
    );
  });

  it("puts the filename hint where each slicer reads it", () => {
    const elegoo = slicerLaunchUrl("elegooslicer", "https://host/api/f", "my model.3mf");
    const inner = new URL(decodeURIComponent(elegoo.split("file=")[1]));
    expect(inner.searchParams.get("filename")).toBe("my model.3mf");

    const snap = slicerLaunchUrl("snapmaker-orca", "https://host/api/f", "my model.3mf");
    expect(snap.endsWith("&name=my%20model.3mf")).toBe(true);
  });
});

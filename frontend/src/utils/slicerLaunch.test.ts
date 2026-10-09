import { describe, expect, it } from "vitest";
import { slicerLaunchUrl } from "./slicerLaunch";

describe("slicerLaunchUrl", () => {
  it("opens every slicer by its own protocol with an encoded file URL", () => {
    expect(slicerLaunchUrl("bambustudio", "https://host/f.3mf")).toBe(
      `bambustudio://open?file=${encodeURIComponent("https://host/f.3mf")}`,
    );
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

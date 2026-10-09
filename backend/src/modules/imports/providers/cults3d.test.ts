import { describe, expect, it } from "vitest";
import { cults3dMetaFromExtension, isCults3dHost, parseCults3dModelUrl } from "./cults3d";
import { buildImportSourceUrl, identifySourceModel } from "../../../services/importService";

describe("Cults3D URLs", () => {
  it("parses model pages with or without a locale", () => {
    const expected = { category: "various", slug: "begode-t4-rear-handle" };
    expect(parseCults3dModelUrl("https://cults3d.com/en/3d-model/various/begode-t4-rear-handle")).toEqual(expected);
    expect(parseCults3dModelUrl("https://cults3d.com/3d-model/various/Begode-T4-Rear-Handle/")).toEqual(expected);
  });

  it("rejects other pages and lookalike hosts", () => {
    expect(parseCults3dModelUrl("https://cults3d.com/en/users/x")).toBeNull();
    expect(parseCults3dModelUrl("https://evilcults3d.com/en/3d-model/a/b")).toBeNull();
    expect(isCults3dHost("www.cults3d.com")).toBe(true);
    expect(isCults3dHost("cults3d.com.evil.example")).toBe(false);
  });

  it("identifies the source model and rebuilds a link", () => {
    const source = identifySourceModel("https://cults3d.com/en/3d-model/various/begode-t4-rear-handle");
    expect(source).toEqual({ provider: "cults3d", externalId: "various/begode-t4-rear-handle" });
    expect(buildImportSourceUrl(source!.provider, source!.externalId)).toBe(
      "https://cults3d.com/en/3d-model/various/begode-t4-rear-handle",
    );
  });
});

describe("cults3dMetaFromExtension", () => {
  it("keeps text and Cults3D images, drops foreign images and junk", () => {
    const meta = cults3dMetaFromExtension({
      title: "  Handle  ",
      description: "Nice",
      creator: "Someone",
      tags: ["a", "", 5, "b"],
      image: "https://images.cults3d.com/x.jpg",
    });
    expect(meta.title).toBe("Handle");
    expect(meta.tags).toEqual(["a", "b"]);
    expect(meta.previewImageUrl).toBe("https://images.cults3d.com/x.jpg");
    expect(cults3dMetaFromExtension({ image: "https://evil.example/x.jpg" }).previewImageUrl).toBeNull();
    expect(cults3dMetaFromExtension({ image: "http://cults3d.com/x.jpg" }).previewImageUrl).toBeNull();
    expect(cults3dMetaFromExtension("nope").title).toBeNull();
  });
});

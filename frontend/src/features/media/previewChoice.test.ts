import { describe, expect, it } from "vitest";
import type { Plate, Print } from "@/api/prints";
import { choosePrintPreview } from "./previewChoice";

const toUrl = (rel: string) => `/api${rel}`;

function plate(filename: string, extra: Partial<Plate> = {}): Plate {
  return { id: "pl1", print_id: "p1", position: 0, filename, mime: "", size: 1, url: `/file/${filename}`, ...extra };
}
function print(plates: Plate[], extra: Partial<Print> = {}): Print {
  return {
    id: "p1",
    name: "n",
    tags: [],
    created_at: "",
    plates,
    preview_images: [],
    supporting_file_count: 0,
    view_count: 0,
    print_count: 0,
    is_favorite: false,
    ...extra,
  };
}

describe("choosePrintPreview", () => {
  it("prefers the cover image over the generated thumbnail", () => {
    const p = print([plate("a.stl")], {
      thumb_url: "/t.jpg",
      preview_images: [{ id: "i", position: 0, url: "/cover.jpg" }],
    });
    expect(choosePrintPreview(p, "automatic", toUrl)).toMatchObject({ kind: "image", src: "/api/cover.jpg" });
  });

  it("falls back to the thumbnail, then to a snapshot for 3D files", () => {
    expect(choosePrintPreview(print([plate("a.stl")], { thumb_url: "/t.jpg" }), "automatic", toUrl)).toMatchObject({
      kind: "image",
      src: "/api/t.jpg",
    });
    expect(choosePrintPreview(print([plate("a.STL".toLowerCase())]), "on-demand", toUrl)).toMatchObject({
      kind: "snapshot",
      mode: "on-demand",
      plateId: "pl1",
    });
  });

  it("respects disabled mode and a server render in progress, but still shows stored images when disabled", () => {
    expect(choosePrintPreview(print([plate("a.3mf")]), "disabled", toUrl)).toEqual({ kind: "disabled" });
    expect(
      choosePrintPreview(print([plate("a.3mf", { processing_status: "processing" })]), "automatic", toUrl),
    ).toEqual({ kind: "processing" });
    expect(choosePrintPreview(print([plate("a.3mf", { processing_status: "failed" })]), "automatic", toUrl).kind).toBe(
      "snapshot",
    );
    expect(choosePrintPreview(print([plate("a.stl")], { thumb_url: "/t.jpg" }), "disabled", toUrl).kind).toBe("image");
  });

  it("handles svg, LightBurn, unknown types and a print without plates", () => {
    expect(choosePrintPreview(print([plate("a.svg")]), "disabled", toUrl)).toMatchObject({
      kind: "image",
      src: "/api/file/a.svg",
    });
    expect(choosePrintPreview(print([plate("a.lbrn2")]), "automatic", toUrl)).toMatchObject({ kind: "lightburn" });
    expect(choosePrintPreview(print([plate("a.pdf")]), "automatic", toUrl)).toEqual({ kind: "none" });
    expect(choosePrintPreview(print([]), "automatic", toUrl)).toEqual({ kind: "none" });
  });
});

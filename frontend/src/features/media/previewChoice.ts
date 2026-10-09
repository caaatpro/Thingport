import type { Plate, Print } from "@/api/prints";
import type { PreviewMode } from "@/api/settings";
import { LIGHTBURN_EXTS, MODEL_EXTS } from "@/constants/fileTypes";
import { extOf } from "@/utils/fileExtensions";

/** What a card-sized preview of a print should render. Pure, so the decision is testable without a DOM. */
export type PreviewChoice =
  | { kind: "image"; src: string; alt: string }
  | { kind: "snapshot"; url: string; ext: string; plateId: string; mode: "automatic" | "on-demand" }
  | { kind: "lightburn"; url: string; plateId: string; filename: string }
  | { kind: "processing" }
  | { kind: "disabled" }
  | { kind: "none" };

export function isPlateProcessing(plate: Plate | undefined): boolean {
  return plate?.processing_status === "queued" || plate?.processing_status === "processing";
}

/**
 * Priority, as in the old app: a user-set/imported cover, then the generated thumbnail, then an SVG itself,
 * then (for 3D files) a client-side snapshot unless previews are disabled, then a LightBurn preview.
 * One addition: while the server is still rendering a 3D plate there is no point racing it in the browser.
 */
export function choosePrintPreview(
  print: Print,
  previewMode: PreviewMode,
  toUrl: (rel: string) => string,
): PreviewChoice {
  const plate = print.plates[0];
  if (!plate) return { kind: "none" };

  const ext = extOf(plate.filename);
  const plateUrl = toUrl(plate.url);
  const cover = print.preview_images?.[0]?.url;
  const image = cover ?? print.thumb_url;
  if (image) return { kind: "image", src: toUrl(image), alt: plate.filename };
  if (ext === "svg") return { kind: "image", src: plateUrl, alt: plate.filename };
  if (MODEL_EXTS.has(ext)) {
    if (previewMode === "disabled") return { kind: "disabled" };
    if (isPlateProcessing(plate)) return { kind: "processing" };
    return { kind: "snapshot", url: plateUrl, ext, plateId: plate.id, mode: previewMode };
  }
  if (LIGHTBURN_EXTS.has(ext)) return { kind: "lightburn", url: plateUrl, plateId: plate.id, filename: plate.filename };
  return { kind: "none" };
}

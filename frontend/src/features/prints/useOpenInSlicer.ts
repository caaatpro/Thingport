import { useMemo } from "react";
import { printsApi, type Plate, type Print } from "@/api/prints";
import { NORMALIZE_3MF_SLICER_IDS, SLICER_OPTIONS } from "@/constants/settingsOptions";
import { useSlicerPreference } from "@/hooks/useSlicerPreference";
import { slicerLaunchUrl } from "@/utils/slicerLaunch";

export type SlicerTarget = { key: string; href: string; filename: string; index: number; plate: Plate | null };

/** Sliced .gcode.3mf plates are never normalized: dropping their G-code would leave nothing to print. */
function isNormalizable3mf(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".3mf") && !lower.endsWith(".gcode.3mf");
}

/** `slicerOption` is null without a usable preference. With several targets, the caller offers a
 *  pick rather than opening the first. `normalizedTargets` is empty unless the slicer needs MakerWorld
 *  3MFs converted. */
export function useOpenInSlicer(print: Print) {
  const slicerPreference = useSlicerPreference();
  const slicerOption = SLICER_OPTIONS.find((opt) => opt.id === slicerPreference && opt.id !== "other") ?? null;

  const targets = useMemo<SlicerTarget[]>(() => {
    if (!slicerOption || !print.slicer_url) return [];
    const launch = (url: string, filename: string) =>
      slicerLaunchUrl(slicerOption.id, printsApi.fileUrl(url), filename);
    const sortedPlates = print.plates.toSorted((a, b) => a.position - b.position);
    const out: SlicerTarget[] = [];
    const slicerUrlIsPlate = sortedPlates.some((p) => p.url === print.slicer_url);
    if (!slicerUrlIsPlate) {
      const filename = print.slicer_filename ?? "";
      out.push({ key: "prepared", href: launch(print.slicer_url, filename), filename, index: -1, plate: null });
    }
    sortedPlates.forEach((plate, index) => {
      const filename = plate.url === print.slicer_url && print.slicer_filename ? print.slicer_filename : plate.filename;
      out.push({ key: plate.id, href: launch(plate.url, filename), filename: plate.filename, index, plate });
    });
    return out;
  }, [print.plates, print.slicer_url, print.slicer_filename, slicerOption]);

  const normalizedTargets = useMemo<SlicerTarget[]>(() => {
    if (!slicerOption || !NORMALIZE_3MF_SLICER_IDS.has(slicerOption.id) || print.source_provider !== "makerworld") {
      return [];
    }
    // A non-removable prepared print means the plates themselves are the sliced files.
    if (print.prepared_print && !print.prepared_print.removable) return [];
    return print.plates
      .toSorted((a, b) => a.position - b.position)
      .map((plate, index) => ({ plate, index }))
      .filter(({ plate }) => isNormalizable3mf(plate.filename))
      .map(({ plate, index }) => ({
        key: `normalized-${plate.id}`,
        href: slicerLaunchUrl(slicerOption.id, printsApi.fileUrl(`${plate.url}?normalize=1`), plate.filename),
        filename: plate.filename,
        index,
        plate,
      }));
  }, [print.plates, print.source_provider, print.prepared_print, slicerOption]);

  return { slicerOption, targets, normalizedTargets };
}

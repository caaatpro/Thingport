import { Lightbulb } from "lucide-react";
import { Tip } from "@/ui";

/** The "Open normalized in <slicer>" icon; hovering it explains what normalizing keeps and changes. */
export function NormalizeInfoIcon({ slicerLabel }: { slicerLabel: string }) {
  return (
    <Tip
      content={`MakerWorld files are Bambu Studio projects, which ${slicerLabel} often opens without their colors or print settings. This opens a converted copy that keeps painted colors, filament colors, plates and the designer's settings (walls, layer height, infill, supports). Heads up: multi-part objects may be merged into one, per-object overrides and layer color changes are dropped, and you pick your own printer profile. The stored file isn't changed.`}
    >
      <Lightbulb className="size-4" aria-hidden />
    </Tip>
  );
}

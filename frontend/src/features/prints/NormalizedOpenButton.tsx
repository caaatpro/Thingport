import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/ui";
import { NormalizeInfoIcon } from "./NormalizeInfoIcon";
import { SlicerFileDialog } from "./SlicerFileDialog";
import type { NormalizeState } from "./useNormalizedOpen";
import type { SlicerTarget } from "./useOpenInSlicer";

type Props = {
  targets: SlicerTarget[];
  slicerLabel: string;
  stateOf: (target: SlicerTarget) => NormalizeState;
  open: (target: SlicerTarget) => Promise<boolean>;
  /** Several targets: the picker opens a file list whose rows show each file's progress. */
  onOpened?: () => void;
};

/** The side panel's "Open normalized in <slicer>" button, in the warning colour. */
export function NormalizedOpenButton({ targets, slicerLabel, stateOf, open, onOpened }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const single = targets.length === 1 ? targets[0] : null;
  const state: NormalizeState = single
    ? stateOf(single)
    : targets.some((target) => stateOf(target) === "preparing")
      ? "preparing"
      : "idle";
  const label =
    state === "preparing"
      ? "Preparing normalized file…"
      : state === "ready"
        ? `Ready – click to open in ${slicerLabel}`
        : `Open normalized in ${slicerLabel}`;

  return (
    <>
      <Button
        onClick={() => (single ? void open(single) : setPickerOpen(true))}
        // Several files stay clickable while one prepares, so the picker can be reopened.
        disabled={Boolean(single) && state === "preparing"}
        icon={
          state === "preparing" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <NormalizeInfoIcon slicerLabel={slicerLabel} />
          )
        }
        className="w-full border-warning bg-surface text-warning hover:bg-warning-soft"
      >
        {label}
        {single ? null : <ChevronDown className="size-4" aria-hidden />}
      </Button>
      {single ? null : (
        <SlicerFileDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          slicerLabel={slicerLabel}
          title={`Open normalized in ${slicerLabel}`}
          targets={targets}
          onOpen={onOpened ?? (() => undefined)}
          normalized={{ stateOf, open }}
        />
      )}
    </>
  );
}

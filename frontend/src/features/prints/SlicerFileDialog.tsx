import { Printer } from "lucide-react";
import { Modal } from "@/ui";
import { fileRowText } from "./fileRowText";
import { PlateImage } from "./PlateImage";
import type { NormalizeState } from "./useNormalizedOpen";
import type { SlicerTarget } from "./useOpenInSlicer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slicerLabel: string;
  targets: SlicerTarget[];
  /** Called after a plain target was opened (records the use). */
  onOpen: () => void;
  /** Heading; defaults to "Open in <slicer>". */
  title?: string;
  /** Normalized picks go through the prepare step instead of being plain links. */
  normalized?: {
    stateOf: (target: SlicerTarget) => NormalizeState;
    open: (target: SlicerTarget) => Promise<boolean>;
  };
};

const rowClass =
  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 disabled:pointer-events-none disabled:opacity-60";

/** Pick which file to open in the slicer when a model has several. */
export function SlicerFileDialog({ open, onOpenChange, slicerLabel, targets, onOpen, title, normalized }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title ?? `Open in ${slicerLabel}`} size="sm">
      <ul className="flex flex-col gap-0.5">
        {targets.map((target) => {
          const text = target.plate
            ? fileRowText(target.filename, target.index)
            : { primary: "Prepared print", secondary: target.filename };
          const state = normalized?.stateOf(target) ?? "idle";
          if (state === "preparing") text.secondary = "Preparing normalized file…";
          if (state === "ready") text.secondary = "Ready – click to open";
          const body = (
            <>
              {target.plate ? (
                <PlateImage plate={target.plate} />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center text-muted">
                  <Printer className="size-4" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{text.primary}</span>
                <span className="block truncate text-xs text-muted">{text.secondary}</span>
              </span>
            </>
          );
          return (
            <li key={target.key} title={target.filename}>
              {normalized ? (
                <button
                  type="button"
                  className={rowClass}
                  disabled={state === "preparing"}
                  // Stays open while preparing, so the row can show progress and then "ready".
                  onClick={() => void normalized.open(target).then((launched) => launched && onOpenChange(false))}
                >
                  {body}
                </button>
              ) : (
                <a
                  href={target.href}
                  className={rowClass}
                  onClick={() => {
                    onOpen();
                    onOpenChange(false);
                  }}
                >
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

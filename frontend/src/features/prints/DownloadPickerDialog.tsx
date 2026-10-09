import { Download, Loader2 } from "lucide-react";
import type { Plate } from "@/api/prints";
import { Button, Modal } from "@/ui";
import { fileRowText } from "./fileRowText";
import { PlateImage } from "./PlateImage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloading: boolean;
  sortedPlates: Plate[];
  downloadAllZip: () => void;
  downloadPlate: (plate: Plate) => void;
};

/** Multi-file models: grab everything as a zip, or one file. */
export function DownloadPickerDialog({
  open,
  onOpenChange,
  downloading,
  sortedPlates,
  downloadAllZip,
  downloadPlate,
}: Props) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Download"
      size="sm"
      locked={downloading}
      footer={
        <Button onClick={() => onOpenChange(false)} disabled={downloading}>
          Cancel
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Button
          variant="primary"
          onClick={downloadAllZip}
          disabled={downloading}
          icon={
            downloading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )
          }
        >
          {`Download all ${sortedPlates.length} files (.zip)`}
        </Button>
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-border" />
          or download one file
          <span className="h-px flex-1 bg-border" />
        </div>
        <ul className="flex flex-col gap-0.5">
          {sortedPlates.map((plate, idx) => {
            const text = fileRowText(plate.filename, idx);
            return (
              <li key={plate.id}>
                <button
                  type="button"
                  onClick={() => downloadPlate(plate)}
                  disabled={downloading}
                  title={plate.filename}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 disabled:pointer-events-none disabled:opacity-60"
                >
                  <PlateImage plate={plate} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{text.primary}</span>
                    <span className="block truncate text-xs text-muted">{text.secondary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

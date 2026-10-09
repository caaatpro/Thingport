import { useState } from "react";
import { Box } from "lucide-react";
import { printsApi, type Plate } from "@/api/prints";
import { cn } from "@/ui";

/** A small square thumbnail of one plate/file, with a neutral placeholder when it has none. */
export function PlateImage({ plate, size = 40, className }: { plate: Plate; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = plate.thumb_url && !failed ? printsApi.fileUrl(plate.thumb_url) : null;
  return (
    <span
      style={{ width: size, height: size }}
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas text-subtle", className)}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <Box className="size-1/2" aria-hidden />
      )}
    </span>
  );
}

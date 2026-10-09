import { useMemo } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { type Print, printsApi } from "@/api/prints";
import { useTheme } from "@/app/theme";
import { usePreviewMode } from "@/app/preferences";
import { cn } from "@/ui";
import LightBurnPreview from "./LightBurnPreview";
import ModelSnapshot from "./ModelSnapshot";
import { choosePrintPreview } from "./previewChoice";

type Props = {
  print: Print;
  /** "card" and "row" crop to fill; "hero" shows the whole image. */
  variant?: "card" | "row" | "hero";
  className?: string;
};

function Placeholder({ icon, text, compact }: { icon: "none" | "busy"; text: string; compact: boolean }) {
  const Icon = icon === "busy" ? Loader2 : ImageOff;
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-surface-2 text-subtle">
      <Icon
        className={cn(compact ? "size-5" : "size-7", icon === "busy" && "animate-spin motion-reduce:animate-none")}
        aria-hidden
      />
      <span className={compact ? "sr-only" : "text-xs"}>{text}</span>
    </div>
  );
}

/** The best preview for a print, filling its parent (the parent sets size and aspect ratio). Cheap in a grid:
 *  images are lazy and WebGL is only used when no stored image exists. */
export default function PrintThumb({ print, variant = "card", className }: Props) {
  const { resolved } = useTheme();
  const previewMode = usePreviewMode();
  const choice = useMemo(() => choosePrintPreview(print, previewMode, printsApi.fileUrl), [print, previewMode]);
  const fit = variant === "hero" ? "object-contain" : "object-cover";
  const compact = variant === "row";

  let content;
  switch (choice.kind) {
    case "image":
      content = (
        <img
          src={choice.src}
          alt={choice.alt}
          loading="lazy"
          decoding="async"
          className={cn("size-full bg-surface-2", fit)}
        />
      );
      break;
    case "snapshot":
      content = (
        <ModelSnapshot
          url={choice.url}
          ext={choice.ext}
          plateId={choice.plateId}
          theme={resolved}
          mode={choice.mode}
          compact={compact}
        />
      );
      break;
    case "lightburn":
      content = (
        <LightBurnPreview url={choice.url} assetId={choice.plateId} filename={choice.filename} imgClassName={fit} />
      );
      break;
    case "processing":
      content = <Placeholder icon="busy" text="Preparing preview…" compact={compact} />;
      break;
    case "disabled":
      content = <Placeholder icon="none" text="Preview generation disabled" compact={compact} />;
      break;
    case "none":
      content = <Placeholder icon="none" text="No preview" compact={compact} />;
      break;
  }

  return <div className={cn("relative size-full overflow-hidden", className)}>{content}</div>;
}

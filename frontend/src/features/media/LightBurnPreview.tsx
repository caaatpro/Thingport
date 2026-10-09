import { useEffect, useState } from "react";
import { cn } from "@/ui";
import { extractLightBurnPreview } from "@/utils/lightburnExtract";

type PreviewState = "idle" | "loading" | "error";

type Props = {
  url: string;
  assetId?: string;
  filename: string;
  /** Classes for the extracted image (object-fit etc.). */
  imgClassName?: string;
};

const previewCache = new Map<string, string>();

/** Extracts the preview image embedded in a LightBurn project and shows it. */
export default function LightBurnPreview({ url, assetId, filename, imgClassName }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState>("idle");

  useEffect(() => {
    let alive = true;
    const cacheKey = assetId ? `asset:${assetId}` : url;
    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPreview(cached);
      setState("idle");
      return () => {
        alive = false;
      };
    }

    setPreview(null);
    setState("loading");
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Preview fetch failed: ${res.status}`);
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const payload = await extractLightBurnPreview(bytes);
        if (!payload) {
          throw new Error("Preview not found in LightBurn file");
        }
        const objectUrl = URL.createObjectURL(
          new Blob([payload.data as Uint8Array<ArrayBuffer>], { type: payload.mime }),
        );
        previewCache.set(cacheKey, objectUrl);
        if (alive) {
          setPreview(objectUrl);
          setState("idle");
        }
      } catch (err) {
        console.warn("LightBurn preview failed:", err);
        if (alive) {
          setState("error");
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [url, assetId]);

  return (
    <div className="flex size-full items-center justify-center overflow-hidden bg-surface-2">
      {preview ? (
        <img src={preview} alt={filename} className={cn("size-full object-cover", imgClassName)} />
      ) : (
        <span className="px-2 text-center text-xs text-muted">
          {state === "loading" ? "Generating preview…" : "Preview unavailable"}
        </span>
      )}
    </div>
  );
}

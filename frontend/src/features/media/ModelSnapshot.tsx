import { useEffect, useRef, useState } from "react";
import { printsApi } from "@/api/prints";
import type { ResolvedTheme } from "@/constants/settingsOptions";
import { Button, Spinner } from "@/ui";

type SnapshotState = "idle" | "loading" | "error";

type Props = {
  url: string;
  ext: string;
  plateId?: string;
  /** Accepted for API compatibility: snapshots are always rendered light, because the result is saved as the
   *  plate's thumbnail and shared by every theme. */
  theme?: ResolvedTheme;
  mode?: "automatic" | "on-demand";
  /** For tiny slots: just the image. Renders at card size since the result becomes the plate's
   *  thumbnail. */
  compact?: boolean;
};

const COMPACT_RENDER_WIDTH = 480;
const COMPACT_RENDER_HEIGHT = 360;

// All snapshots share one queue, so a hung job would block every other card.
const SNAPSHOT_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Snapshot generation timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// three.js is only fetched when a snapshot is actually needed. Once loaded, the cache is read synchronously so
// a grid of already-rendered cards paints without a flash.
type SnapshotModule = typeof import("@/utils/modelSnapshotCache");
let loadedModule: SnapshotModule | null = null;
async function loadSnapshotModule(): Promise<SnapshotModule> {
  loadedModule ??= await import("@/utils/modelSnapshotCache");
  return loadedModule;
}

/** Renders a model off-screen into a still image, remembers it, and uploads it as the plate's thumbnail when
 *  `plateId` is given (so the server has one next time). Fills its parent. */
export default function ModelSnapshot({ url, ext, plateId, mode = "automatic", compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cacheKey = plateId ? `plate:${plateId}` : url;
  const [snapshot, setSnapshot] = useState<string | null>(() => loadedModule?.snapshotCache.get(cacheKey) ?? null);
  const [state, setState] = useState<SnapshotState>("idle");
  const [requested, setRequested] = useState(mode === "automatic");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (mode === "automatic") setRequested(true);
  }, [mode]);

  useEffect(() => {
    let disposed = false;
    let observer: IntersectionObserver | null = null;
    const cached = loadedModule?.snapshotCache.get(cacheKey);
    if (cached) {
      setSnapshot(cached);
      return;
    }
    setSnapshot(null);
    const load = async () => {
      if (!containerRef.current) return;
      setState("loading");
      try {
        const rect = containerRef.current.getBoundingClientRect();
        const width = compact ? COMPACT_RENDER_WIDTH : Math.max(120, Math.floor(rect.width || 240));
        const height = compact ? COMPACT_RENDER_HEIGHT : Math.max(120, Math.floor(rect.height || 180));
        const { generateModelSnapshot, queueSnapshotJob, snapshotCache } = await loadSnapshotModule();
        const existing = snapshotCache.get(cacheKey);
        if (existing) {
          if (!disposed) {
            setSnapshot(existing);
            setState("idle");
          }
          return;
        }
        const image = await queueSnapshotJob(async () => {
          if (disposed) return null;
          return withTimeout(generateModelSnapshot(url, ext, width, height, "light"), SNAPSHOT_TIMEOUT_MS);
        });
        if (disposed || !image) return;
        snapshotCache.set(cacheKey, image);
        setSnapshot(image);
        setState("idle");
        if (plateId) {
          try {
            const imageBlob = await fetch(image).then((response) => response.blob());
            await printsApi.uploadGeneratedThumbnail(plateId, imageBlob);
          } catch (err) {
            console.warn("Generated preview could not be persisted:", err);
          }
        }
      } catch (err) {
        console.warn("Snapshot generation failed:", err);
        if (!disposed) {
          setState("error");
        }
      }
    };
    if (!requested) {
      setState("idle");
      return () => {
        disposed = true;
      };
    }
    if (mode === "automatic" && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          void load();
        },
        { rootMargin: "240px" },
      );
      if (containerRef.current) observer.observe(containerRef.current);
    } else {
      void load();
    }
    return () => {
      disposed = true;
      observer?.disconnect();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [url, ext, plateId, cacheKey, mode, requested, retryToken, compact]);

  let content;
  if (snapshot) {
    content = <img src={snapshot} alt="Preview" className="size-full object-cover" />;
  } else if (compact) {
    content = state === "loading" ? <Spinner label="Generating preview" className="size-3.5" /> : null;
  } else if (state === "loading") {
    content = (
      <span className="flex items-center gap-2 text-xs text-muted">
        <Spinner label="Generating preview" className="size-3.5" />
        Generating preview…
      </span>
    );
  } else if (state === "error") {
    content = (
      <div className="flex flex-col items-center gap-1.5 px-2 text-center">
        <span className="text-xs text-danger">Preview failed to load.</span>
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setState("idle");
            setRetryToken((v) => v + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  } else if (mode === "on-demand" && !requested) {
    content = (
      <Button
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          setRequested(true);
        }}
      >
        Generate preview
      </Button>
    );
  } else {
    content = <span className="text-xs text-muted">Waiting to generate preview…</span>;
  }

  return (
    <div ref={containerRef} className="flex size-full items-center justify-center overflow-hidden bg-surface-2">
      {content}
    </div>
  );
}

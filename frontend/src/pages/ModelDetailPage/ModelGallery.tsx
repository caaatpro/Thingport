import { lazy, Suspense, useMemo, useState } from "react";
import { Box, ChevronLeft, ChevronRight } from "lucide-react";
import { printsApi, type Print } from "@/api/prints";
import { MODEL_EXTS } from "@/constants/fileTypes";
import PrintThumb from "@/features/media/PrintThumb";
import { Button, IconButton, cn } from "@/ui";
import { extOf } from "@/utils/fileExtensions";

const Model3DPreviewModal = lazy(() => import("@/features/media/Model3DPreviewModal"));

/**
 * The hero of the page: the model's own pictures (with a thumbnail strip and a blurred backdrop that fills the
 * letterbox bars) or, when it has none, its generated 3D snapshot. PrintThumb renders that snapshot inside
 * this clipped box and saves it as the model's thumbnail, so nothing here can widen the page.
 */
export function ModelGallery({ print }: { print: Print }) {
  const images = useMemo(
    () => print.preview_images.toSorted((a, b) => a.position - b.position),
    [print.preview_images],
  );
  const [requested, setRequested] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  // A saved edit can remove images; clamp instead of resetting so the viewer keeps its place otherwise.
  const index = Math.min(requested, Math.max(0, images.length - 1));
  const active = images[index];
  const title = print.title || print.name;
  const firstPlate = print.plates[0];
  const canPreview3d = Boolean(firstPlate) && MODEL_EXTS.has(extOf(firstPlate?.filename ?? ""));
  const step = (dir: -1 | 1) => setRequested((index + dir + images.length) % images.length);

  return (
    <div>
      {/* min-w-0 on the grid column and overflow-hidden here: a huge intrinsic image size must not stretch the layout. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card border border-border bg-surface">
        {active ? (
          <>
            <img
              src={printsApi.fileUrl(active.url)}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full max-w-full scale-[1.15] object-cover blur-[30px]"
            />
            <img
              src={printsApi.fileUrl(active.url)}
              alt={title}
              className="absolute inset-0 size-full max-w-full object-contain"
            />
          </>
        ) : (
          <PrintThumb print={print} variant="hero" />
        )}

        {images.length > 1 ? (
          <>
            <IconButton
              label="Previous image"
              variant="overlay"
              className="absolute top-1/2 left-2 -translate-y-1/2"
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </IconButton>
            <IconButton
              label="Next image"
              variant="overlay"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => step(1)}
            >
              <ChevronRight className="size-5" aria-hidden />
            </IconButton>
          </>
        ) : null}

        {canPreview3d ? (
          <Button
            size="sm"
            className="absolute bottom-3 left-3 bg-surface/90 backdrop-blur"
            icon={<Box className="size-4" aria-hidden />}
            onClick={() => setPreviewOpen(true)}
          >
            3D Preview
          </Button>
        ) : null}
      </div>

      {images.length > 1 ? (
        <ul aria-label="Preview images" className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setRequested(i)}
                className={cn(
                  "block h-16 w-[84px] overflow-hidden rounded-control border-2 bg-surface-2",
                  i === index ? "border-accent" : "border-border hover:border-border-strong",
                )}
              >
                <img
                  src={printsApi.fileUrl(image.url)}
                  alt=""
                  loading="lazy"
                  className="size-full max-w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {previewOpen ? (
        <Suspense fallback={null}>
          <Model3DPreviewModal print={print} onClose={() => setPreviewOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Layers, Minus, Plus } from "lucide-react";
import { type Print, printsApi } from "@/api/prints";
import { useTheme } from "@/app/theme";
import { MODEL_EXTS } from "@/constants/fileTypes";
import { IconButton, Modal, PageLoading, cn } from "@/ui";
import { extOf, stemOf } from "@/utils/fileExtensions";
import type { PlateSummary } from "@/utils/bambuThreeMf";
import PlateThumbnail from "./PlateThumbnail";
import PreviewToolbar, { DEFAULT_PREVIEW_COLOR } from "./PreviewToolbar";
import type { CameraView, ModelViewerHandle, RenderStyle } from "./viewerTypes";

const ModelViewer = lazy(() => import("./ModelViewer"));

const ZOOM_STEP = 1.25;

type Props = {
  print: Print;
  onClose: () => void;
};

/** e.g. "Body" / "File 2 · STL". */
function fileRowText(filename: string, index: number): { primary: string; secondary: string } {
  const type = extOf(filename).toUpperCase();
  return { primary: stemOf(filename), secondary: type ? `File ${index + 1} · ${type}` : `File ${index + 1}` };
}

const rowClass = (selected: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors hover:bg-surface-2",
    selected && "bg-accent-soft hover:bg-accent-soft",
  );

/** The plate list is always shown, even for one plate, so the layout doesn't jump. */
export default function Model3DPreviewModal({ print, onClose }: Props) {
  const { resolved } = useTheme();
  const sortedPlates = useMemo(() => print.plates.toSorted((a, b) => a.position - b.position), [print.plates]);
  const [activePlateId, setActivePlateId] = useState<string | null>(sortedPlates[0]?.id ?? null);
  const activePlate = sortedPlates.find((p) => p.id === activePlateId) || sortedPlates[0];
  const ext = activePlate ? extOf(activePlate.filename) : "";
  const is3d = Boolean(activePlate) && MODEL_EXTS.has(ext);

  // Plates inside the active .3mf, reset when the file changes.
  const [internalPlates, setInternalPlates] = useState<PlateSummary[]>([]);
  const [internalThumbnails, setInternalThumbnails] = useState<Record<number, string | null>>({});
  const [selectedInternalPlateId, setSelectedInternalPlateId] = useState<number | null>(null);

  // Lives here so it survives the viewer remounting per file.
  const viewerRef = useRef<ModelViewerHandle>(null);
  const [renderStyle, setRenderStyle] = useState<RenderStyle>("solid");
  const [modelColor, setModelColor] = useState<string>(DEFAULT_PREVIEW_COLOR);
  const [cameraView, setCameraView] = useState<CameraView>("topFront");
  const [showGrid, setShowGrid] = useState(true);
  const [spin, setSpin] = useState(true);

  const handleCameraView = (view: CameraView) => {
    setCameraView(view);
    viewerRef.current?.setCameraView(view);
  };

  const handleReset = () => {
    setRenderStyle("solid");
    setModelColor(DEFAULT_PREVIEW_COLOR);
    setShowGrid(true);
    setSpin(true);
    handleCameraView("topFront");
  };

  // A lone multi-plate file doesn't need its own row above its plates.
  const showFileRows = sortedPlates.length > 1 || internalPlates.length === 0;

  const handlePlatesDetected = (plates: PlateSummary[], getThumbnail: (index: number) => Promise<string | null>) => {
    setInternalPlates(plates);
    setSelectedInternalPlateId(plates[0]?.index ?? null);
    setInternalThumbnails({});
    Promise.all(plates.map(async (plate) => [plate.index, await getThumbnail(plate.index)] as const)).then((pairs) => {
      setInternalThumbnails(Object.fromEntries(pairs));
    });
  };

  const selectPlate = (plateId: string) => {
    // The viewer won't remount for the same file, so its plates wouldn't be re-reported.
    if (plateId === activePlate?.id) return;
    setActivePlateId(plateId);
    setInternalPlates([]);
    setInternalThumbnails({});
    setSelectedInternalPlateId(null);
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={print.title || print.name}
      size="xl"
      className="h-[85vh] max-h-[85vh] max-w-6xl"
    >
      <div className="flex h-full min-h-72 flex-col gap-3 md:flex-row">
        <nav aria-label="Files" className="max-h-36 shrink-0 overflow-y-auto md:max-h-none md:w-60">
          {showFileRows && (
            <ul className="flex flex-col gap-0.5">
              {sortedPlates.map((plate, idx) => {
                const { primary, secondary } = fileRowText(plate.filename, idx);
                const selected = plate.id === activePlate?.id;
                return (
                  <li key={plate.id}>
                    {/* Named by file: "plate" is kept for the build plates inside a 3MF. */}
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      title={plate.filename}
                      onClick={() => selectPlate(plate.id)}
                      className={rowClass(selected)}
                    >
                      <PlateThumbnail plate={plate} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg">{primary}</span>
                        <span className="block truncate text-xs text-muted">{secondary}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {internalPlates.length > 0 && (
            <>
              {showFileRows && (
                <p className="my-2 border-t border-border px-2 pt-2 text-xs text-muted">
                  {internalPlates.length} plates in this file
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {internalPlates.map((plate) => {
                  const selected = plate.index === selectedInternalPlateId;
                  const thumb = internalThumbnails[plate.index];
                  return (
                    <li key={plate.index}>
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => setSelectedInternalPlateId(plate.index)}
                        className={rowClass(selected)}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="size-8 shrink-0 rounded-md bg-surface-2 object-cover" />
                        ) : (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle">
                            <Layers className="size-4" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-fg">
                            {plate.name ? `Plate ${plate.index} — ${plate.name}` : `Plate ${plate.index}`}
                          </span>
                          <span className="block text-xs text-muted">
                            {plate.objectCount === 1 ? "1 object" : `${plate.objectCount} objects`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="relative min-h-64 min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-canvas">
          {is3d && activePlate ? (
            <Suspense fallback={<PageLoading className="h-full items-center py-0" />}>
              <ModelViewer
                ref={viewerRef}
                key={activePlate.id}
                url={printsApi.fileUrl(activePlate.url)}
                ext={ext}
                initialCameraView={cameraView}
                theme={resolved}
                colorOverride={modelColor}
                renderStyle={renderStyle}
                showBuildPlate={showGrid}
                buildPlateForMeshes
                autoRotate={spin}
                selectedPlateId={selectedInternalPlateId}
                previewGlbUrl={activePlate.preview_glb_url ? printsApi.fileUrl(activePlate.preview_glb_url) : null}
                onPlatesDetected={handlePlatesDetected}
              />
            </Suspense>
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted">Preview unavailable</div>
          )}

          {is3d && (
            <>
              {/* Just above the viewer's orientation cube (72px, 12px from the corner). */}
              <div className="absolute right-3 bottom-24 flex flex-col gap-2">
                <IconButton variant="overlay" label="Zoom in" onClick={() => viewerRef.current?.zoom(1 / ZOOM_STEP)}>
                  <Plus className="size-4" aria-hidden />
                </IconButton>
                <IconButton variant="overlay" label="Zoom out" onClick={() => viewerRef.current?.zoom(ZOOM_STEP)}>
                  <Minus className="size-4" aria-hidden />
                </IconButton>
              </div>
              <div className="absolute inset-x-3 bottom-3 flex justify-center">
                <PreviewToolbar
                  cameraView={cameraView}
                  onCameraView={handleCameraView}
                  renderStyle={renderStyle}
                  onRenderStyleChange={setRenderStyle}
                  color={modelColor}
                  onColorChange={setModelColor}
                  showGrid={showGrid}
                  onShowGridChange={setShowGrid}
                  spin={spin}
                  onSpinChange={setSpin}
                  onReset={handleReset}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

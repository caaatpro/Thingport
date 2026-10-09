import { Grid3x3, RotateCcw, Rotate3d } from "lucide-react";
import { Button, IconButton, Select, cn } from "@/ui";
import type { CameraView, RenderStyle } from "./viewerTypes";

export const PREVIEW_COLORS = [
  { name: "Red", value: "#d32f2f" },
  { name: "Orange", value: "#f57c00" },
  { name: "Yellow", value: "#fbc02d" },
  { name: "Green", value: "#00b800" },
  { name: "Blue", value: "#1976d2" },
  { name: "Purple", value: "#7b1fa2" },
  { name: "Grey", value: "#78909c" },
] as const;

export const DEFAULT_PREVIEW_COLOR = "#00b800";

const CAMERA_VIEWS: { value: CameraView; label: string }[] = [
  { value: "topFront", label: "Top / Front" },
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

const RENDER_STYLES: { value: RenderStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "wire", label: "Wireframe" },
  { value: "xray", label: "X-ray" },
];

type Props = {
  cameraView: CameraView;
  /** Called on every pick, including re-picking the current view, since the camera may have been orbited away. */
  onCameraView: (view: CameraView) => void;
  renderStyle: RenderStyle;
  onRenderStyleChange: (style: RenderStyle) => void;
  color: string;
  onColorChange: (color: string) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  spin: boolean;
  onSpinChange: (spin: boolean) => void;
  /** Back to the default view, style and colour. */
  onReset: () => void;
  className?: string;
};

const divider = <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;

/** Stateless floating toolbar: the parent owns every value. Every control is a native button or a Radix select,
 *  so Tab and Enter/Space work throughout. */
export default function PreviewToolbar({
  cameraView,
  onCameraView,
  renderStyle,
  onRenderStyleChange,
  color,
  onColorChange,
  showGrid,
  onShowGridChange,
  spin,
  onSpinChange,
  onReset,
  className,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Preview options"
      className={cn(
        "flex max-w-full items-center gap-1 overflow-x-auto rounded-card border border-border bg-surface/95 p-1.5 shadow-overlay backdrop-blur",
        className,
      )}
    >
      <Select
        size="sm"
        aria-label="Camera view"
        className="w-32"
        value={cameraView}
        onChange={(v) => onCameraView(v as CameraView)}
        options={CAMERA_VIEWS}
      />
      <Select
        size="sm"
        aria-label="Render style"
        className="w-32"
        value={renderStyle}
        onChange={(v) => onRenderStyleChange(v as RenderStyle)}
        options={RENDER_STYLES}
      />
      {divider}
      <fieldset className="m-0 flex min-w-0 items-center gap-1 border-0 p-0 px-1">
        <legend className="sr-only">Model colour</legend>
        {PREVIEW_COLORS.map(({ name, value }) => (
          <button
            key={value}
            type="button"
            title={name}
            aria-label={`Model colour: ${name}`}
            aria-pressed={value === color}
            onClick={() => onColorChange(value)}
            style={{ backgroundColor: value }}
            className={cn(
              "size-5 shrink-0 rounded-full ring-1 ring-black/20 ring-inset transition-shadow",
              value === color && "ring-2 ring-offset-2 ring-offset-surface ring-fg",
            )}
          />
        ))}
      </fieldset>
      {divider}
      <Button size="sm" variant="ghost" icon={<Grid3x3 className="size-4" aria-hidden />} aria-pressed={showGrid} onClick={() => onShowGridChange(!showGrid)} className={cn(showGrid && "bg-surface-2 text-fg")}>
        Grid
      </Button>
      <Button size="sm" variant="ghost" icon={<Rotate3d className="size-4" aria-hidden />} aria-pressed={spin} onClick={() => onSpinChange(!spin)} className={cn(spin && "bg-surface-2 text-fg")}>
        Spin
      </Button>
      {divider}
      <IconButton size="sm" label="Reset view" onClick={onReset}>
        <RotateCcw className="size-4" aria-hidden />
      </IconButton>
    </div>
  );
}

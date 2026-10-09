import { usePreviewMode, useSetPreviewMode } from "@/app/preferences";
import { errorMessage } from "@/app/queryClient";
import type { PreviewMode } from "@/api/settings";
import { Alert, cn } from "@/ui";
import { AdminSection } from "../AdminPage/parts";

const OPTIONS: { id: PreviewMode; label: string; description: string }[] = [
  { id: "automatic", label: "Automatic", description: "Load missing previews only as cards enter view, then save them for future visits." },
  { id: "on-demand", label: "On demand", description: "Show saved previews immediately and generate missing ones only when requested." },
  {
    id: "disabled",
    label: "Disabled",
    description: "Never generate card previews. Interactive viewing remains available by opening a model.",
  },
];

/** Instance-wide: when the browser renders the 3D thumbnails on model cards. Saves as soon as it's chosen. */
export default function PreviewsSection() {
  const current = usePreviewMode();
  const set = useSetPreviewMode();
  // Show the choice at once; it snaps back if saving fails.
  const mode = set.isPending ? set.variables : current;

  return (
    <AdminSection title="Model previews" description="Control background preview generation for the whole instance.">
      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0" disabled={set.isPending}>
        <legend className="sr-only">Preview generation</legend>
        <Alert title="What this controls">
          This only affects the small 3D thumbnail shown on model cards, never the full model viewer. It also only applies to files with no thumbnail yet:
          an embedded thumbnail from a sliced .3mf file, or one already generated before, is always reused regardless of this setting. This choice decides
          what happens for the rest, typically .stl/.obj files or a .3mf with no embedded thumbnail.
        </Alert>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((option) => {
            const selected = mode === option.id;
            return (
              <div
                key={option.id}
                className={cn(
                  "relative flex items-start gap-3 rounded-card border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                  selected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                )}
              >
                <input
                  id={`preview-mode-${option.id}`}
                  type="radio"
                  name="preview-mode"
                  value={option.id}
                  checked={selected}
                  onChange={() => set.mutate(option.id)}
                  className="relative z-10 mt-1 size-4 accent-accent"
                />
                <label htmlFor={`preview-mode-${option.id}`} className="min-w-0 flex-1 cursor-pointer after:absolute after:inset-0 after:rounded-card">
                  <span className="block text-sm font-medium text-fg">{option.label}</span>
                  <span className="block text-sm text-muted">{option.description}</span>
                </label>
              </div>
            );
          })}
        </div>
        {set.error ? <Alert tone="danger">{errorMessage(set.error, "Failed to save preview settings.")}</Alert> : null}
      </fieldset>
    </AdminSection>
  );
}

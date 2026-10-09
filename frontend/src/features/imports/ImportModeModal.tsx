import { Alert, Modal } from "@/ui";
import { useAction } from "./useAction";
import type { ImportMode, ModePromptConfig } from "./prompts";

const OPTIONS: { mode: ImportMode; title: string; description: string }[] = [
  {
    mode: "separate",
    title: "Import as separate models",
    description: "Each file becomes its own model with a single plate.",
  },
  {
    mode: "multiplate",
    title: "Import as one model with several files",
    description: "All files are added to a single new model, in the order selected.",
  },
];

/** For a flat multi-file pick: one model per file, or all files as plates of one model. */
export default function ImportModeModal({ config, onClose }: { config: ModePromptConfig; onClose: () => void }) {
  const { busy, error, run } = useAction();

  const choose = async (mode: ImportMode) => {
    if (await run(() => config.onChoose(mode))) onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Import ${config.count} files`}
      description={<span className="line-clamp-2 break-all">{config.label}</span>}
      locked={busy}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg">How should these files be imported?</p>
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={busy}
            onClick={() => void choose(option.mode)}
            className="rounded-card border border-border bg-surface p-3.5 text-left transition-colors hover:border-accent hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="block text-sm font-medium text-fg">{option.title}</span>
            <span className="mt-0.5 block text-sm text-muted">{option.description}</span>
          </button>
        ))}
        {busy ? <output className="text-sm text-muted">Importing…</output> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

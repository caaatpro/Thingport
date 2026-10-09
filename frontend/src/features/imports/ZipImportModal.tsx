import { useState } from "react";
import { Alert, Button, Checkbox, Modal } from "@/ui";
import { formatFileSize } from "@/utils/fileSize";
import type { ZipEntry } from "@/utils/zipUtils";
import { toggleInSet } from "./selection";
import { useAction } from "./useAction";
import type { ZipPromptConfig } from "./prompts";

/**
 * Step 1: keep the zip as one model, or unzip it. Step 2: pick which files to import. Folders inside the zip
 * become categories (that mapping happens in the upload step, which reuses same-named categories).
 */
export default function ZipImportModal({ config, onClose }: { config: ZipPromptConfig; onClose: () => void }) {
  const [entries, setEntries] = useState<ZipEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { busy, error, setError, run } = useAction();

  const selecting = entries !== null;
  const allSelected = selecting && entries.length > 0 && selected.size === entries.length;

  const asZip = async () => {
    if (await run(config.onImportAsZip)) onClose();
  };

  const unzip = async () => {
    await run(async () => {
      const list = await config.loadEntries();
      setEntries(list);
      setSelected(new Set(list.map((e) => e.path)));
    }, "Couldn't read the zip contents.");
  };

  const importSelected = async () => {
    if (selected.size === 0) {
      setError("Select at least one file to import.");
      return;
    }
    if (await run(() => config.onImportSelected(Array.from(selected)))) onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={selecting ? "Choose files" : "Import zip"}
      description={<span className="line-clamp-2 break-all">{config.label}</span>}
      size="lg"
      locked={busy}
      footer={
        selecting ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void importSelected()} loading={busy} disabled={selected.size === 0}>
              Import selected
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {!selecting ? (
          <>
            <p className="text-sm text-fg">How would you like to handle this zip file?</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void asZip()} disabled={busy}>
                Import as zip
              </Button>
              <Button onClick={() => void unzip()} loading={busy}>
                Import and unzip
              </Button>
            </div>
            <p className="text-xs text-muted">Unzipping lets you pick files; folders inside become categories.</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {selected.size} of {entries.length} selected
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setSelected(new Set(entries.map((e) => e.path)))} disabled={busy || allSelected}>
                  Select all
                </Button>
                <Button size="sm" onClick={() => setSelected(new Set())} disabled={busy || selected.size === 0}>
                  Clear
                </Button>
              </div>
            </div>
            {entries.length === 0 ? (
              <p className="rounded-control border border-border px-3 py-4 text-sm text-muted">No files found in this zip.</p>
            ) : (
              <ul className="max-h-[360px] divide-y divide-border overflow-auto rounded-control border border-border">
                {entries.map((entry) => (
                  <li key={entry.path} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      aria-label={`Select ${entry.path}`}
                      checked={selected.has(entry.path)}
                      onCheckedChange={() => setSelected((prev) => toggleInSet(prev, entry.path))}
                      disabled={busy}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg" title={entry.path}>
                      {entry.path}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{formatFileSize(entry.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

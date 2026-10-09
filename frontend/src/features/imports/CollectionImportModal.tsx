import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Checkbox, Modal, PageLoading } from "@/ui";
import { errorMessage } from "@/app/queryClient";
import { defaultCollectionSelection, toggleInSet } from "./selection";
import { useAction } from "./useAction";
import type { CollectionPromptConfig } from "./prompts";

/** Lists the models of a Thingiverse/Printables collection (or a Thingiverse user's likes) to pick from. */
export default function CollectionImportModal({ config, onClose }: { config: CollectionPromptConfig; onClose: () => void }) {
  const entriesQuery = useQuery({
    queryKey: ["import-entries", config.label],
    queryFn: config.loadEntries,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const { busy, error, setError, run } = useAction();
  // Until the user touches the checklist, the selection is "everything not yet in the library".
  const [picked, setPicked] = useState<Set<string> | null>(null);

  const result = entriesQuery.data;
  const entries = result?.entries ?? [];
  const selected = picked ?? defaultCollectionSelection(entries);
  const selectable = entries.filter((e) => !e.already_imported);
  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  const importSelected = async () => {
    if (selected.size === 0) {
      setError("Select at least one model to import.");
      return;
    }
    if (await run(() => config.onImportSelected(Array.from(selected)))) onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={result?.title || "Import collection"}
      description={<span className="line-clamp-2 break-all">{config.label}</span>}
      size="lg"
      locked={busy}
      footer={
        result ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void importSelected()} loading={busy} disabled={selected.size === 0}>
              Import selected
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {entriesQuery.isPending ? (
          <output aria-label="Loading collection" className="block">
            <PageLoading className="py-10" />
          </output>
        ) : null}
        {entriesQuery.isError ? (
          <Alert tone="danger" title="Couldn't load this collection">
            {errorMessage(entriesQuery.error, "Check the link and try again.")}
          </Alert>
        ) : null}
        {result ? (
          <>
            {result.truncated ? (
              <Alert tone="info">
                Loaded the first {entries.length} of {result.total} models in this collection.
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {selected.size} of {entries.length} selected
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setPicked(defaultCollectionSelection(entries))} disabled={busy || allSelected}>
                  Select all
                </Button>
                <Button size="sm" onClick={() => setPicked(new Set())} disabled={busy || selected.size === 0}>
                  Clear
                </Button>
              </div>
            </div>
            {entries.length === 0 ? (
              <p className="rounded-control border border-border px-3 py-4 text-sm text-muted">No models found in this collection.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-border overflow-auto rounded-control border border-border">
                {entries.map((entry) => (
                  <li key={entry.design_id} className={entry.already_imported ? "flex items-center gap-3 px-3 py-2 opacity-60" : "flex items-center gap-3 px-3 py-2"}>
                    <Checkbox
                      aria-label={`Select ${entry.title}`}
                      checked={selected.has(entry.design_id)}
                      onCheckedChange={() => setPicked(toggleInSet(selected, entry.design_id))}
                      disabled={busy || entry.already_imported}
                    />
                    {entry.cover ? (
                      <img src={entry.cover} alt="" loading="lazy" decoding="async" className="size-10 shrink-0 rounded-md bg-surface-2 object-cover" />
                    ) : (
                      <span className="size-10 shrink-0 rounded-md bg-surface-2" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg" title={entry.title}>
                      {entry.title}
                    </span>
                    {entry.already_imported ? <Badge tone="outline">Already in library</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

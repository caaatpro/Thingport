import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FolderInput, ListPlus, Tag, Trash2, X } from "lucide-react";
import { UnauthorizedError } from "@/api/client";
import { collectionsApi, type Collection } from "@/api/collections";
import type { Category } from "@/api/categories";
import { printsApi, type Print } from "@/api/prints";
import { Button, IconButton, Menu, MenuItem, Modal, TagInput, useConfirm, useToast } from "@/ui";
import { useInvalidatePrints } from "./queryKeys";

type Props = {
  selected: Print[];
  categories: Category[];
  onClear: () => void;
};

/** "Parent / Child" labels so nested categories stay distinguishable in a flat menu. */
export function categoryPaths(categories: Category[]): { id: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const label = (c: Category): string => {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    return parent ? `${label(parent)} / ${c.name}` : c.name;
  };
  return categories.map((c) => ({ id: c.id, label: label(c) })).toSorted((a, b) => a.label.localeCompare(b.label));
}

type Job = { work: (print: Print) => Promise<unknown>; done: string };

/** The floating action bar for a selection of models: add to collection, add tags, move to category, delete. */
export function BulkBar({ selected, categories, onClear }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const invalidate = useInvalidatePrints();
  const [collectionsWanted, setCollectionsWanted] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [newTags, setNewTags] = useState<string[]>([]);
  const count = selected.length;

  // Loaded the first time the menu is opened.
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.list(),
    enabled: collectionsWanted,
  });

  /** One request per model; failures are reported once and the lists refresh. */
  const run = useMutation({
    mutationFn: async ({ work }: Job) => {
      const results = await Promise.allSettled(selected.map(work));
      const unauthorized = results.find((r) => r.status === "rejected" && r.reason instanceof UnauthorizedError);
      // Rethrown so the query client signs the user out once.
      if (unauthorized?.status === "rejected") throw unauthorized.reason;
      return { failed: results.filter((r) => r.status === "rejected").length };
    },
    onSuccess: ({ failed }, { done }) => {
      if (failed) toast.warning(`${failed} of ${count} failed`);
      else toast.success(done);
      if (failed < count) onClear();
      void invalidate();
    },
  });
  const busy = run.isPending;

  const addToCollection = (collection: Collection) =>
    run.mutate({
      work: (print) => collectionsApi.addItem(collection.id, print.id),
      done: `Added to “${collection.name}”`,
    });

  const applyTags = () => {
    const tags = newTags;
    setTagsOpen(false);
    setNewTags([]);
    if (!tags.length) return;
    run.mutate({
      work: (print) => {
        const merged = [...print.tags];
        for (const tag of tags) {
          if (!merged.some((existing) => existing.toLowerCase() === tag.toLowerCase())) merged.push(tag);
        }
        return printsApi.setTags(print.id, merged);
      },
      done: "Tags added",
    });
  };

  const moveTo = (categoryId: string | null) =>
    run.mutate({ work: (print) => printsApi.updateCategory(print.id, categoryId), done: "Moved" });

  const remove = async () => {
    const ok = await confirm({
      message: `Delete ${count} ${count === 1 ? "model" : "models"}? This cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    run.mutate({
      work: (print) => printsApi.delete(print.id),
      done: `Deleted ${count} ${count === 1 ? "model" : "models"}`,
    });
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label={`${count} selected`}
        className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-2xl border border-border-strong bg-surface px-3 py-2 shadow-overlay"
      >
        <IconButton label="Clear selection" size="sm" onClick={onClear}>
          <X className="size-4" aria-hidden />
        </IconButton>
        <span className="pr-2 text-sm font-semibold text-fg">{`${count} selected`}</span>
        <Menu
          trigger={
            <Button size="sm" variant="ghost" disabled={busy} icon={<ListPlus className="size-4" aria-hidden />}>
              Add to collection
            </Button>
          }
          align="start"
          side="top"
          className="max-h-80 overflow-y-auto"
          onOpenChange={(open) => open && setCollectionsWanted(true)}
        >
          {collections.isPending && collectionsWanted ? <MenuItem disabled>Loading…</MenuItem> : null}
          {collections.data?.length === 0 ? <MenuItem disabled>No collections yet</MenuItem> : null}
          {collections.data?.map((collection) => (
            <MenuItem key={collection.id} onSelect={() => addToCollection(collection)}>
              {collection.name}
            </MenuItem>
          ))}
        </Menu>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          icon={<Tag className="size-4" aria-hidden />}
          onClick={() => setTagsOpen(true)}
        >
          Add tags
        </Button>
        <Menu
          trigger={
            <Button size="sm" variant="ghost" disabled={busy} icon={<FolderInput className="size-4" aria-hidden />}>
              Move to category
            </Button>
          }
          align="start"
          side="top"
          className="max-h-80 overflow-y-auto"
        >
          <MenuItem onSelect={() => moveTo(null)}>No category</MenuItem>
          {categoryPaths(categories).map((c) => (
            <MenuItem key={c.id} onSelect={() => moveTo(c.id)}>
              {c.label}
            </MenuItem>
          ))}
        </Menu>
        <Button
          size="sm"
          variant="danger-ghost"
          disabled={busy}
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => void remove()}
        >
          Delete
        </Button>
      </div>

      <Modal
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        title={`Add tags to ${count} ${count === 1 ? "model" : "models"}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setTagsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyTags} disabled={!newTags.length}>
              Add tags
            </Button>
          </>
        }
      >
        <TagInput value={newTags} onChange={setNewTags} placeholder="Type a tag and press Enter" aria-label="Tags" />
      </Modal>
    </>
  );
}

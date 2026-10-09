import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Check, GripVertical, Info, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Category, CategoryMetaInput } from "@/api/categories";
import { buildCategoryTree, flattenCategoryTree } from "@/utils/categoryTree";
import { Button, IconButton, Input, Modal, cn, useConfirm } from "@/ui";
import { CategoryMetaDialog } from "./CategoryMetaDialog";
import { INDENT_PX, applyDrop, getProjection, planDrop, type FlatItem } from "./dropPlan";
import type { CategoryActions } from "./useCategoryActions";

type Props = {
  categories: Category[];
  actions: CategoryActions;
  onClose: () => void;
};

const hasMeta = (c: Category) =>
  Boolean(c.meta_title || c.meta_description || c.makerworld_cat_ids || c.thingiverse_cat_ids || c.printables_cat_ids);

type RowProps = {
  category: Category;
  depth: number;
  busy: boolean;
  /** Up/down arrows; top-level categories only (subcategories are dragged). */
  move?: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void };
  dragHandle?: ReactNode;
  nodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  onOpenMeta: () => void;
  onAddChild: () => void;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
};

/** A name field with confirm/cancel, used for renaming and for adding. Enter saves, Escape cancels. */
function NameEditor({
  initial,
  label,
  busy,
  onSubmit,
  onCancel,
  style,
}: {
  initial: string;
  label: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  style?: CSSProperties;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  return (
    <div className="flex items-center gap-1 py-1" style={style}>
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(event) => {
          const { key } = event;
          if (key === "Enter" && trimmed) onSubmit(trimmed);
          if (key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
        className="h-8 flex-1"
      />
      <IconButton label="Save" size="sm" disabled={busy || !trimmed} onClick={() => onSubmit(trimmed)}>
        <Check className="size-4" aria-hidden />
      </IconButton>
      <IconButton label="Cancel" size="sm" disabled={busy} onClick={onCancel}>
        <X className="size-4" aria-hidden />
      </IconButton>
    </div>
  );
}

function CategoryRow({
  category,
  depth,
  busy,
  move,
  dragHandle,
  nodeRef,
  style,
  onOpenMeta,
  onAddChild,
  onRename,
  onDelete,
}: RowProps) {
  const [editing, setEditing] = useState(false);
  const name = category.name || "Untitled";
  const indent = { paddingLeft: depth * INDENT_PX };

  if (editing) {
    return (
      <li ref={nodeRef} style={{ ...style, ...indent }}>
        <NameEditor
          initial={category.name}
          label="Category name"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={(next) => {
            if (next === category.name) return setEditing(false);
            void onRename(next).then((ok) => ok && setEditing(false));
          }}
        />
      </li>
    );
  }

  const details = hasMeta(category);
  return (
    <li ref={nodeRef} style={{ ...style, ...indent }} className="flex items-center gap-1 py-0.5">
      {dragHandle ?? <span className="size-8 shrink-0" aria-hidden={depth === 0} />}
      <span className={cn("min-w-0 flex-1 truncate text-sm text-fg", depth === 0 && "font-semibold")} title={name}>
        {name}
      </span>
      {move ? (
        <>
          <IconButton label="Move up" size="sm" disabled={busy || !move.canUp} onClick={move.onUp}>
            <ArrowUp className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Move down" size="sm" disabled={busy || !move.canDown} onClick={move.onDown}>
            <ArrowDown className="size-4" aria-hidden />
          </IconButton>
        </>
      ) : null}
      <IconButton label={`Add subcategory to ${name}`} size="sm" disabled={busy} onClick={onAddChild}>
        <Plus className="size-4" aria-hidden />
      </IconButton>
      <IconButton
        label={`${details ? "Edit" : "Add"} details for ${name}`}
        size="sm"
        disabled={busy}
        onClick={onOpenMeta}
      >
        <Info className={cn("size-4", details ? "text-accent-text" : "opacity-60")} aria-hidden />
      </IconButton>
      <IconButton label={`Rename ${name}`} size="sm" disabled={busy} onClick={() => setEditing(true)}>
        <Pencil className="size-4" aria-hidden />
      </IconButton>
      <IconButton label={`Delete ${name}`} variant="danger" size="sm" disabled={busy} onClick={onDelete}>
        <Trash2 className="size-4" aria-hidden />
      </IconButton>
    </li>
  );
}

/** Every row is in the sortable list so the others can be placed around it; only subcategories drag. */
function TreeRow({ depth, category, ...rest }: Omit<RowProps, "nodeRef" | "style" | "dragHandle">) {
  const isRoot = depth === 0;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: isRoot,
  });
  return (
    <CategoryRow
      {...rest}
      category={category}
      depth={depth}
      nodeRef={setNodeRef}
      // The DragOverlay shows the dragged row; this one stays as a faint placeholder at the projected level.
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      dragHandle={
        isRoot ? undefined : (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${category.name || "Untitled"} to move`}
            className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-subtle hover:bg-surface-2 hover:text-fg"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )
      }
    />
  );
}

/**
 * Create, rename, delete and reorder categories. Subcategories drag (sideways to change level); top-level
 * ones use the arrows. A drop shows at once and stays until the refetched categories arrive.
 */
export function CategoryManager({ categories, actions, onClose }: Props) {
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [metaCategory, setMetaCategory] = useState<Category | null>(null);
  const [addingUnderId, setAddingUnderId] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);

  const [optimistic, setOptimistic] = useState<{ base: Category[]; list: Category[] } | null>(null);
  const shown = optimistic?.base === categories ? optimistic.list : categories;
  const tree = useMemo(() => buildCategoryTree(shown), [shown]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  // While dragging, the dragged category's subtree is folded into it.
  const flat = useMemo(() => flattenCategoryTree(tree, activeId ? new Set([activeId]) : undefined), [tree, activeId]);
  const items = useMemo<FlatItem[]>(
    () =>
      flat.map(({ category, depth }) => ({
        id: category.id,
        parentId: category.parent_id && tree.byId.has(category.parent_id) ? category.parent_id : null,
        depth,
      })),
    [flat, tree],
  );
  const projection = activeId && overId ? getProjection(items, activeId, overId, offsetX) : null;

  const sensors = useSensors(
    // A few pixels of travel before dragging, so clicks on the handle don't start one.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const withBusy = async <T,>(id: string, run: () => Promise<T>): Promise<T> => {
    setBusyId(id);
    try {
      return await run();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (category: Category) => {
    const name = category.name || "Untitled";
    const hasChildren = Boolean(tree.childrenByParent[category.id]?.length);
    const ok = await confirm({
      title: "Delete category?",
      message: hasChildren
        ? `Delete “${name}”? Its subcategories move up one level, and any models directly in it become uncategorised.`
        : `Delete “${name}”? Any models in it become uncategorised.`,
      destructive: true,
    });
    if (ok) await withBusy(category.id, () => actions.remove(category.id));
  };

  const moveRoot = (index: number, direction: -1 | 1) => {
    const ids = tree.roots.map((r) => r.id);
    const swap = index + direction;
    if (swap < 0 || swap >= ids.length) return;
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    void withBusy(ids[swap], () => actions.reorder(ids));
  };

  const resetDrag = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setOverId(String(active.id));
    setOffsetX(0);
    setAddingUnderId(null);
  };
  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetX(delta.x);
  const handleDragOver = ({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    const target = projection;
    resetDrag();
    if (!target || !over) return;
    const originalSiblings: Record<string, string[]> = { "": tree.roots.map((c) => c.id) };
    for (const [parent, children] of Object.entries(tree.childrenByParent))
      originalSiblings[parent] = children.map((c) => c.id);
    const plan = planDrop(items, originalSiblings, String(active.id), String(over.id), target);
    if (!plan) return;
    setOptimistic({ base: categories, list: applyDrop(shown, plan) });
    await withBusy(plan.id, () =>
      plan.sameParent ? actions.reorder(plan.siblingIds) : actions.move(plan.id, plan.parentId, plan.position),
    );
  };

  // The add-subcategory input goes after the category's last descendant.
  const addAfterId = useMemo(() => {
    if (!addingUnderId) return null;
    const start = flat.findIndex((f) => f.category.id === addingUnderId);
    if (start === -1) return null;
    let end = start;
    while (flat[end + 1] && flat[end + 1].depth > flat[start].depth) end += 1;
    return flat[end].category.id;
  }, [flat, addingUnderId]);
  const addingDepth = addingUnderId ? (flat.find((f) => f.category.id === addingUnderId)?.depth ?? 0) + 1 : 0;
  const activeCategory = activeId ? tree.byId.get(activeId) : undefined;

  return (
    <>
      <Modal
        open
        onOpenChange={(open) => !open && onClose()}
        title="Manage categories"
        description="Drag a subcategory to move it. Drag sideways to change its level."
        size="lg"
        hideClose
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          // Folding the dragged subtree shifts the rows below, so keep re-measuring.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={resetDrag}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul>
              {flat.map(({ category, depth }) => {
                const rootIndex = depth === 0 ? tree.roots.findIndex((r) => r.id === category.id) : -1;
                return (
                  <Fragment key={category.id}>
                    <TreeRow
                      category={category}
                      depth={category.id === activeId && projection ? projection.depth : depth}
                      busy={busyId === category.id}
                      move={
                        depth === 0
                          ? {
                              canUp: rootIndex > 0,
                              canDown: rootIndex < tree.roots.length - 1,
                              onUp: () => moveRoot(rootIndex, -1),
                              onDown: () => moveRoot(rootIndex, 1),
                            }
                          : undefined
                      }
                      onOpenMeta={() => setMetaCategory(category)}
                      onAddChild={() => setAddingUnderId(category.id)}
                      onRename={(name) => withBusy(category.id, () => actions.rename(category.id, name))}
                      onDelete={() => void handleDelete(category)}
                    />
                    {addAfterId === category.id && addingUnderId ? (
                      <li>
                        <NameEditor
                          initial=""
                          label="Subcategory name"
                          busy={busyId === `new-${addingUnderId}`}
                          style={{ paddingLeft: addingDepth * INDENT_PX }}
                          onCancel={() => setAddingUnderId(null)}
                          onSubmit={(name) =>
                            void withBusy(`new-${addingUnderId}`, () => actions.create(name, addingUnderId)).then(
                              (ok) => ok && setAddingUnderId(null),
                            )
                          }
                        />
                      </li>
                    ) : null}
                  </Fragment>
                );
              })}
            </ul>
          </SortableContext>
          <DragOverlay>
            {activeCategory ? (
              <div className="flex cursor-grabbing items-center gap-1 rounded-control border border-border bg-surface px-1 py-1 shadow-overlay">
                <GripVertical className="size-4 text-subtle" aria-hidden />
                <span className="truncate text-sm text-fg">{activeCategory.name || "Untitled"}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {!tree.roots.length && !addingRoot ? (
          <p className="py-2 text-sm text-muted">No categories yet. Add one to get started.</p>
        ) : null}

        <div className="mt-3 border-t border-border pt-3">
          {addingRoot ? (
            <NameEditor
              initial=""
              label="Category name"
              busy={busyId === "new-root"}
              onCancel={() => setAddingRoot(false)}
              onSubmit={(name) =>
                void withBusy("new-root", () => actions.create(name, null)).then((ok) => ok && setAddingRoot(false))
              }
            />
          ) : (
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAddingRoot(true)}>
              Add category
            </Button>
          )}
        </div>
      </Modal>
      {metaCategory ? (
        <CategoryMetaDialog
          category={metaCategory}
          onClose={() => setMetaCategory(null)}
          onSave={(meta: CategoryMetaInput) => actions.updateMeta(metaCategory.id, meta)}
        />
      ) : null}
    </>
  );
}

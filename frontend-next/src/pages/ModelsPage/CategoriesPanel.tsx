import { useMemo, useState } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Category } from "@/api/categories";
import { ancestorPath, buildCategoryTree, flattenCategoryTree, type CategoryTree } from "@/utils/categoryTree";
import { Alert, Button, IconButton, Select, Skeleton, cn, type SelectOption } from "@/ui";
import { CategoryManager } from "./CategoryManager";
import { categoryHref } from "./libraryParams";
import { useWideScreen } from "./useWideScreen";
import type { CategoryActions } from "./useCategoryActions";

type Props = {
  categories: Category[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedId: string | null;
  /** The current URL params, so each link keeps sort, scope and anything else. */
  search: URLSearchParams;
  /** Used by the dropdown on small screens; the tree itself is plain links. */
  onSelect: (id: string | null) => void;
  actions: CategoryActions;
};

const rowClass = (active: boolean) =>
  cn(
    "flex min-h-9 min-w-0 flex-1 items-center rounded-control px-2.5 py-1.5 text-sm transition-colors",
    active ? "bg-accent-soft font-semibold text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg",
  );

type NodeProps = {
  category: Category;
  depth: number;
  tree: CategoryTree;
  selectedId: string | null;
  search: URLSearchParams;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
};

function CategoryNode({ category, depth, tree, selectedId, search, isOpen, toggle }: NodeProps) {
  const children = tree.childrenByParent[category.id] ?? [];
  const open = isOpen(category.id);
  const active = selectedId === category.id;
  const name = category.name || "Untitled";
  return (
    <li>
      <div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
        <Link
          to={categoryHref(search, category.id)}
          aria-current={active ? "page" : undefined}
          className={cn(rowClass(active), depth === 0 && "font-medium")}
        >
          <span className="truncate">{name}</span>
        </Link>
        {children.length ? (
          <IconButton
            label={`${open ? "Collapse" : "Expand"} ${name}`}
            size="sm"
            noTip
            aria-expanded={open}
            onClick={() => toggle(category.id)}
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
          </IconButton>
        ) : (
          <span className="size-8 shrink-0" aria-hidden />
        )}
      </div>
      {open && children.length ? (
        <ul>
          {children.map((child) => (
            <CategoryNode key={child.id} category={child} depth={depth + 1} tree={tree} selectedId={selectedId} search={search} isOpen={isOpen} toggle={toggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The category tree: a side column on wide screens, a dropdown on narrow ones. Any depth; a category includes everything beneath it. */
export function CategoriesPanel({ categories, loading, error, onRetry, selectedId, search, onSelect, actions }: Props) {
  const wide = useWideScreen();
  const [managerOpen, setManagerOpen] = useState(false);
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  // The selected category's ancestors are open so a selection from the URL is always visible; chevrons override.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const pathIds = useMemo(() => new Set(selectedId && tree.byId.has(selectedId) ? ancestorPath(tree, selectedId) : []), [tree, selectedId]);
  const isOpen = (id: string) => toggled[id] ?? pathIds.has(id);
  const toggle = (id: string) => setToggled((prev) => ({ ...prev, [id]: !isOpen(id) }));

  const manage = (
    <IconButton label="Manage categories" size="sm" onClick={() => setManagerOpen(true)}>
      <Settings2 className="size-4" aria-hidden />
    </IconButton>
  );

  const options = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "All" },
      ...flattenCategoryTree(tree).map(({ category, depth }) => ({
        value: category.id,
        label: category.name || "Untitled",
        indent: depth,
      })),
    ],
    [tree],
  );

  let body;
  if (loading) {
    body = (
      <div aria-busy="true" aria-label="Loading categories" className="flex flex-col gap-1.5 p-1">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-5/6" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  } else if (error) {
    body = (
      <Alert
        tone="danger"
        action={
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        Couldn't load categories.
      </Alert>
    );
  } else {
    body = (
      <ul>
        <li className="flex items-center">
          <Link to={categoryHref(search, null)} aria-current={selectedId === null ? "page" : undefined} className={cn(rowClass(selectedId === null), "font-medium")}>
            All
          </Link>
          <span className="size-8 shrink-0" aria-hidden />
        </li>
        {tree.roots.map((root) => (
          <CategoryNode key={root.id} category={root} depth={0} tree={tree} selectedId={selectedId} search={search} isOpen={isOpen} toggle={toggle} />
        ))}
        {tree.roots.length ? null : <li className="px-2.5 py-2 text-sm text-muted">No categories yet</li>}
      </ul>
    );
  }

  return (
    <>
      {wide ? (
        <nav
          aria-label="Categories"
          className="sticky top-20 max-h-[calc(100vh-6rem)] w-60 shrink-0 self-start overflow-y-auto rounded-card border border-border bg-surface p-2"
        >
          <div className="flex items-center justify-between pb-1 pl-2.5">
            <h2 className="text-sm font-semibold text-fg">Categories</h2>
            {manage}
          </div>
          {body}
        </nav>
      ) : (
        <nav aria-label="Categories" className="mb-4 flex items-center gap-2">
          {loading || error ? (
            <div className="flex-1">{body}</div>
          ) : (
            <Select
              aria-label="Category"
              value={selectedId ?? ""}
              onChange={(value) => onSelect(value || null)}
              options={options}
              className="flex-1"
            />
          )}
          {manage}
        </nav>
      )}
      {managerOpen ? <CategoryManager categories={categories} actions={actions} onClose={() => setManagerOpen(false)} /> : null}
    </>
  );
}

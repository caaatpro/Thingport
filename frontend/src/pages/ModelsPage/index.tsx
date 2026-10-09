import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { categoriesApi, type Category } from "@/api/categories";
import { errorMessage } from "@/app/queryClient";
import {
  BulkBar,
  ModelGrid,
  ModelGridEmpty,
  ModelGridSkeleton,
  ScopeSegmented,
  SortSegmented,
  ViewToggle,
  usePrintList,
  useViewMode,
} from "@/features/prints";
import { buildCategoryTree, subtreeIds } from "@/utils/categoryTree";
import { Alert, Button, PageHeader, Spinner } from "@/ui";
import { CategoriesPanel } from "./CategoriesPanel";
import { CategoryBanner } from "./CategoryBanner";
import { readLibraryParams, withLibraryParams, type LibraryParams } from "./libraryParams";
import { useCategoryActions } from "./useCategoryActions";

const NO_CATEGORIES: Category[] = [];

/** Which empty state fits: a brand-new library, nothing shared yet, or a filter with no hits. */
function emptyCopy(params: LibraryParams): { title: string; hint: string } {
  if (params.category) return { title: "No models here", hint: "Nothing matches this category or filter." };
  if (params.scope === "mine") {
    return {
      title: "Your library is empty",
      hint: "Drop model files anywhere on this page, or use Add to upload files or import a link.",
    };
  }
  return {
    title: "Nothing shared with you yet",
    hint: "Models and collections other people share with you will show up here.",
  };
}

export default function ModelsPage() {
  const [search, setSearch] = useSearchParams();
  const params = readLibraryParams(search);
  const { category, sort, scope } = params;
  const [view, setView] = useViewMode();

  const change = (next: Partial<LibraryParams>) => setSearch((prev) => withLibraryParams(prev, next));

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const categories = categoriesQuery.data ?? NO_CATEGORIES;
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const selectedCategory = category ? (tree.byId.get(category) ?? null) : null;

  // A category includes the models at every level beneath it. Wait for the tree so the list loads once.
  const categoryIds = category ? subtreeIds(tree, category) : [];
  const categoryFilter = category ? (categoryIds.length === 1 ? category : categoryIds) : undefined;
  const treeSettled = !category || !categoriesQuery.isPending;

  const list = usePrintList({ category_id: categoryFilter, order_by: sort, scope, enabled: treeSettled });
  const { items, sentinelRef } = list;

  // Selection belongs to one set of filters; changing them starts over.
  const filterId = `${category ?? ""}|${sort}|${scope}`;
  const [selection, setSelection] = useState<{ filterId: string; ids: Set<string> }>({ filterId, ids: new Set() });
  const selectedIds = selection.filterId === filterId ? selection.ids : new Set<string>();
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const toggle = (id: string) => {
    // Only your own models can be changed in bulk.
    if (items.find((item) => item.id === id)?.is_owner === false) return;
    const ids = new Set(selectedIds);
    if (!ids.delete(id)) ids.add(id);
    setSelection({ filterId, ids });
  };
  const clear = () => setSelection({ filterId, ids: new Set() });

  const actions = useCategoryActions(categories, (id) => {
    if (id === category) change({ category: null });
  });

  const loading = list.isLoading || !treeSettled;
  const empty = emptyCopy(params);

  let content;
  if (loading) {
    content = <ModelGridSkeleton view={view} />;
  } else if (list.isError) {
    content = (
      <Alert
        tone="danger"
        title="Couldn't load models"
        action={
          <Button size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      >
        {errorMessage(list.error, "Check your connection and try again.")}
      </Alert>
    );
  } else if (!items.length) {
    content = <ModelGridEmpty title={empty.title}>{empty.hint}</ModelGridEmpty>;
  } else {
    content = (
      <>
        <ModelGrid items={items} view={view} selection={{ selected: selectedIds, toggle }} />
        <div ref={sentinelRef} className="flex min-h-8 justify-center py-3">
          {list.isFetchingNextPage ? <Spinner label="Loading more models" /> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Models" subtitle={selectedCategory ? selectedCategory.name || "Untitled" : undefined} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ScopeSegmented value={scope} onChange={(next) => change({ scope: next })} />
        <div className="flex flex-wrap items-center gap-3">
          <SortSegmented value={sort} onChange={(next) => change({ sort: next })} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-6">
        <CategoriesPanel
          categories={categories}
          loading={categoriesQuery.isPending}
          error={categoriesQuery.isError}
          onRetry={() => void categoriesQuery.refetch()}
          selectedId={category}
          search={search}
          onSelect={(id) => change({ category: id })}
          actions={actions}
        />
        <div className="min-w-0 flex-1">
          {selectedCategory ? <CategoryBanner category={selectedCategory} /> : null}
          {content}
        </div>
      </div>
      {selectedItems.length > 0 ? <BulkBar selected={selectedItems} categories={categories} onClear={clear} /> : null}
    </>
  );
}

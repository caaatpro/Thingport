import { LayoutGrid, List } from "lucide-react";
import type { PrintSortMode } from "@/api/prints";
import { Segmented, type SegmentedOption } from "@/ui";
import type { ViewMode } from "./useViewMode";

export type PrintScope = "mine" | "shared" | "all";

const VIEW_OPTIONS: SegmentedOption<ViewMode>[] = [
  { value: "grid", label: <LayoutGrid className="size-4" aria-hidden />, "aria-label": "Grid" },
  { value: "list", label: <List className="size-4" aria-hidden />, "aria-label": "List" },
];

/** Grid / List switch; the segments are toggle buttons with `aria-pressed`. */
export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ViewMode;
  onChange: (view: ViewMode) => void;
  className?: string;
}) {
  return (
    <Segmented pressed label="View" value={value} onChange={onChange} options={VIEW_OPTIONS} className={className} />
  );
}

const SORT_OPTIONS: SegmentedOption<PrintSortMode>[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "downloads", label: "Downloads" },
];

/** "Popular" sorts by views, "Downloads" by print count. */
export function SortSegmented({
  value,
  onChange,
  className,
}: {
  value: PrintSortMode;
  onChange: (mode: PrintSortMode) => void;
  className?: string;
}) {
  return <Segmented label="Sort" value={value} onChange={onChange} options={SORT_OPTIONS} className={className} />;
}

const SCOPE_OPTIONS: SegmentedOption<PrintScope>[] = [
  { value: "mine", label: "My models" },
  { value: "shared", label: "Shared with me" },
  { value: "all", label: "All" },
];

export function ScopeSegmented({
  value,
  onChange,
  className,
}: {
  value: PrintScope;
  onChange: (scope: PrintScope) => void;
  className?: string;
}) {
  return <Segmented label="Show" value={value} onChange={onChange} options={SCOPE_OPTIONS} className={className} />;
}

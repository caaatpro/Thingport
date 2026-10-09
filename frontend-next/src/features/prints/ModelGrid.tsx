import type { ReactNode } from "react";
import { Boxes } from "lucide-react";
import type { Print } from "@/api/prints";
import { EmptyState, Skeleton, cn } from "@/ui";
import type { ViewMode } from "./useViewMode";
import { ModelCard, type PrintSelection } from "./ModelCard";
import { ModelRow } from "./ModelRow";

// Never wider than the container, so a narrow screen gets one column instead of horizontal scroll.
const GRID_CLASS = "grid gap-5 grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))]";

type Props = {
  items: Print[];
  view: ViewMode;
  /** Gives each card a checkbox; a plain click on a card toggles it while anything is selected. */
  selection?: PrintSelection;
  /** Only for a real collection: adds "Remove from collection" to each model's menu. */
  collectionId?: string;
};

/** The responsive grid of cards, or the list of rows. */
export function ModelGrid({ items, view, selection, collectionId }: Props) {
  return (
    <ul className={view === "list" ? "flex flex-col gap-2" : GRID_CLASS}>
      {items.map((print) => (
        <li key={print.id} className="min-w-0">
          {view === "list" ? (
            <ModelRow print={print} selection={selection} collectionId={collectionId} />
          ) : (
            <ModelCard print={print} selection={selection} collectionId={collectionId} />
          )}
        </li>
      ))}
    </ul>
  );
}

const SKELETON_SLOTS = Array.from({ length: 24 }, (_, i) => `slot-${i}`);

/** Placeholders shaped like the final cards or rows. */
export function ModelGridSkeleton({ view, count = 10 }: { view: ViewMode; count?: number }) {
  const slots = SKELETON_SLOTS.slice(0, count);
  return (
    <div aria-busy="true" aria-label="Loading models" className={view === "list" ? "flex flex-col gap-2" : GRID_CLASS}>
      {slots.map((slot) =>
        view === "list" ? (
          <Skeleton key={slot} className="h-[88px] rounded-xl" />
        ) : (
          <div key={slot} className="overflow-hidden rounded-card border border-border bg-surface">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/** What to show where the grid would be when there are no models. */
export function ModelGridEmpty({
  title = "No models here yet",
  children,
  action,
  className,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState icon={<Boxes />} title={title} action={action} className={cn(className)}>
      {children}
    </EmptyState>
  );
}

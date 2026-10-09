import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/ui";

/** Spread onto the element that starts a drag (a grip button, or the whole tile). */
export type DragHandle = { attributes: object; listeners: object | undefined; isDragging: boolean };

function SortableItem({ id, className, children }: { id: string; className?: string; children: (drag: DragHandle) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className={cn(className, isDragging && "relative z-10 opacity-70")}>
      {children({ attributes, listeners, isDragging })}
    </li>
  );
}

type Props<T> = {
  items: T[];
  getId: (item: T) => string;
  onReorder: (items: T[]) => void;
  direction: "horizontal" | "vertical";
  className?: string;
  itemClassName?: string;
  /** Rendered after the sortable items inside the same list (e.g. an "Add" tile). */
  trailing?: ReactNode;
  label: string;
  children: (item: T, index: number, drag: DragHandle) => ReactNode;
};

/** A drag-and-drop list that also works from the keyboard (focus a handle, Space, arrows, Space). */
export function SortableList<T>({ items, getId, onReorder, direction, className, itemClassName, trailing, label, children }: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={direction === "horizontal" ? horizontalListSortingStrategy : verticalListSortingStrategy}>
        <ul aria-label={label} className={className}>
          {items.map((item, index) => (
            <SortableItem key={getId(item)} id={getId(item)} className={itemClassName}>
              {(drag) => children(item, index, drag)}
            </SortableItem>
          ))}
          {trailing}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

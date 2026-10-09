import { arrayMove } from "@dnd-kit/sortable";
import type { Category } from "@/api/categories";

/** One nesting level. Also how far a row must be dragged sideways to change its level. */
export const INDENT_PX = 24;

export type FlatItem = { id: string; parentId: string | null; depth: number };
export type Projection = { depth: number; parentId: string | null };

/**
 * Where the dragged row would land: its vertical position comes from the row it's over, its level from how far
 * it was dragged sideways, kept within what the neighbours allow. Null when there is no valid level, e.g. above
 * the first top-level category, since dragging never makes a top-level one.
 */
export function getProjection(items: FlatItem[], activeId: string, overId: string, offsetX: number): Projection | null {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const overIndex = items.findIndex((i) => i.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;
  const moved = arrayMove(items, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const maxDepth = previous ? previous.depth + 1 : 0;
  // Can't slip in above `next` at a shallower level than it: that would steal it as a child.
  const minDepth = Math.max(next ? next.depth : 0, 1);
  if (!previous || maxDepth < minDepth) return null;
  const wanted = items[activeIndex].depth + Math.round(offsetX / INDENT_PX);
  const depth = Math.min(Math.max(wanted, minDepth), maxDepth);

  let parentId: string | null;
  if (depth === previous.depth) parentId = previous.parentId;
  else if (depth > previous.depth) parentId = previous.id;
  else parentId = moved.slice(0, overIndex).findLast((i) => i.depth === depth)?.parentId ?? null;
  return { depth, parentId };
}

export type DropPlan = {
  id: string;
  parentId: string | null;
  position: number;
  /** The new parent's children in their new order. */
  siblingIds: string[];
  /** Same parent as before: a reorder call is enough. Otherwise a move call. */
  sameParent: boolean;
};

/** What to ask the server for after a drop, or null when nothing changes. */
export function planDrop(
  items: FlatItem[],
  originalSiblings: Record<string, string[]>,
  activeId: string,
  overId: string,
  target: Projection,
): DropPlan | null {
  const moved = arrayMove(
    items,
    items.findIndex((i) => i.id === activeId),
    items.findIndex((i) => i.id === overId),
  );
  const siblingIds = moved
    .filter((i) => (i.id === activeId ? target.parentId : i.parentId) === target.parentId)
    .map((i) => i.id);
  const originalParentId = items.find((i) => i.id === activeId)?.parentId ?? null;
  const sameParent = originalParentId === target.parentId;
  const before = originalSiblings[originalParentId ?? ""] ?? [];
  if (sameParent && siblingIds.length === before.length && siblingIds.every((c, i) => c === before[i])) return null;
  return { id: activeId, parentId: target.parentId, position: siblingIds.indexOf(activeId), siblingIds, sameParent };
}

/** The category list as it will look once the drop succeeds, so the UI can show it right away. */
export function applyDrop(list: Category[], plan: DropPlan): Category[] {
  return list.map((c) => {
    if (c.id === plan.id) return { ...c, parent_id: plan.parentId, position: plan.position };
    const index = plan.siblingIds.indexOf(c.id);
    return index === -1 ? c : { ...c, position: index };
  });
}

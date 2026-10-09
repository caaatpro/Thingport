import { useRef, useState, type ComponentType, type MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Box,
  Download,
  Folder,
  GripVertical,
  Hash,
  Layers,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Tag,
  X,
  type LucideProps,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/app/auth";
import { bookmarksApi, type BookmarkEntry } from "@/api/bookmarks";
import { IconButton, Tip, cn } from "@/ui";
import { BrandMark, Wordmark } from "./Brand";

const COLLAPSED_KEY = "thingport.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Whether the desktop sidebar is the 72px icon rail. Remembered in localStorage. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // Not remembered; the toggle still works for this visit.
    }
  };
  return [collapsed, toggle];
}

type Icon = ComponentType<LucideProps>;

/** Models also covers a model's own page and author pages; Tags is only the index (a tag page is reached via its bookmark). */
const isCollections = (path: string) => path.startsWith("/models/collections");
const isTagsIndex = (path: string) => path === "/models/tags";
const isModels = (path: string) =>
  (path.startsWith("/models") && !isCollections(path) && !path.startsWith("/models/tags")) ||
  path.startsWith("/authors");

const LIBRARY: { to: string; label: string; icon: Icon; active: (path: string) => boolean }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, active: (p) => p === "/" },
  { to: "/models", label: "Models", icon: Box, active: isModels },
  { to: "/models/collections", label: "Collections", icon: Layers, active: isCollections },
  { to: "/models/tags", label: "Tags", icon: Tag, active: isTagsIndex },
];

const rowClass = (active: boolean, collapsed: boolean) =>
  cn(
    "group relative flex h-10 shrink-0 items-center gap-3 rounded-control px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg",
    collapsed && "justify-center px-0",
    active &&
      "bg-accent-soft font-semibold text-accent-text hover:bg-accent-soft hover:text-accent-text before:absolute before:inset-y-2.5 before:-left-2 before:w-[3px] before:rounded-full before:bg-accent",
  );

function NavItem({
  to,
  label,
  icon: IconComponent,
  active,
  collapsed,
}: {
  to: string;
  label: string;
  icon: Icon;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link to={to} aria-current={active ? "page" : undefined} className={rowClass(active, collapsed)}>
      <IconComponent className="size-[18px] shrink-0" aria-hidden />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
    </Link>
  );
  return collapsed ? (
    <Tip content={label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

function GroupLabel({ children }: { children: string }) {
  return <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">{children}</p>;
}

function bookmarkTarget(entry: BookmarkEntry): { href: string; label: string; icon: Icon } {
  return entry.type === "tag"
    ? { href: `/models/tags/${encodeURIComponent(entry.tag)}`, label: entry.tag, icon: Hash }
    : { href: `/models/collections/${entry.collection_id}`, label: entry.name, icon: Folder };
}

// A click that ends a drag (pointer or Space key) must not also navigate.
const POST_DRAG_CLICK_GUARD_MS = 250;

/** dnd-kit marks a draggable as a button; a bookmark is a link and has to stay one. */
function withoutButtonRole(attributes: object): object {
  const copy: Record<string, unknown> = { ...attributes };
  delete copy.role;
  delete copy["aria-pressed"];
  return copy;
}

function SortableBookmark({
  entry,
  active,
  onClick,
}: {
  entry: BookmarkEntry;
  active: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const { href, label, icon: IconComponent } = bookmarkTarget(entry);
  return (
    <Link
      ref={setNodeRef}
      to={href}
      draggable={false}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...withoutButtonRole(attributes)}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition, touchAction: "none" }}
      className={cn(rowClass(active, false), "cursor-grab", isDragging && "opacity-40")}
    >
      <IconComponent className="size-[18px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <GripVertical
        className="size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

/** The user's pinned tags and collections, in their own order. Drag to reorder (expanded sidebar only). */
function Bookmarks({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const queryClient = useQueryClient();
  const { data: bookmarks = [] } = useQuery({ queryKey: ["bookmarks"], queryFn: () => bookmarksApi.list() });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const suppressClick = useRef(false);

  const reorder = useMutation({
    mutationFn: (next: BookmarkEntry[]) => bookmarksApi.reorder(next.map((b) => b.id)),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      queryClient.setQueryData(["bookmarks"], next);
    },
    onSuccess: (saved) => queryClient.setQueryData(["bookmarks"], saved),
    // The server's order is the truth if saving failed.
    onError: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space only: Enter keeps opening the bookmark.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  if (bookmarks.length === 0) return null;

  const endDrag = () => {
    setDraggingId(null);
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, POST_DRAG_CLICK_GUARD_MS);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (!over || active.id === over.id) return;
    const from = bookmarks.findIndex((b) => b.id === active.id);
    const to = bookmarks.findIndex((b) => b.id === over.id);
    if (from === -1 || to === -1) return;
    reorder.mutate(arrayMove(bookmarks, from, to));
  };

  const swallowClickAfterDrag = (event: MouseEvent) => {
    if (draggingId || suppressClick.current) event.preventDefault();
  };

  if (collapsed) {
    return (
      <>
        <div className="mx-2 my-3 border-t border-border" />
        {bookmarks.map((entry) => {
          const { href, label, icon } = bookmarkTarget(entry);
          return <NavItem key={entry.id} to={href} label={label} icon={icon} active={pathname === href} collapsed />;
        })}
      </>
    );
  }

  const dragging = draggingId ? bookmarks.find((b) => b.id === draggingId) : undefined;
  const DraggingIcon = dragging ? bookmarkTarget(dragging).icon : null;
  return (
    <>
      <GroupLabel>Bookmarks</GroupLabel>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDraggingId(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <SortableContext items={bookmarks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {bookmarks.map((entry) => (
            <SortableBookmark
              key={entry.id}
              entry={entry}
              active={pathname === bookmarkTarget(entry).href}
              onClick={swallowClickAfterDrag}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {dragging && DraggingIcon ? (
            <div className="flex h-10 cursor-grabbing items-center gap-3 rounded-control border border-border bg-surface px-3 text-sm font-medium text-fg shadow-overlay">
              <DraggingIcon className="size-[18px] shrink-0" aria-hidden />
              <span className="truncate">{bookmarkTarget(dragging).label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

type BodyProps = {
  collapsed: boolean;
  onToggle?: () => void;
  /** Rendered inside the mobile drawer: shows a close button instead of the collapse toggle. */
  drawer?: boolean;
};

function SidebarBody({ collapsed, onToggle, drawer }: BodyProps) {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggle = onToggle ? (
    <IconButton label={toggleLabel} size="sm" onClick={onToggle}>
      <ToggleIcon className="size-[18px]" aria-hidden />
    </IconButton>
  ) : null;

  return (
    <>
      <div
        className={cn("flex h-16 shrink-0 items-center px-4", collapsed ? "justify-center px-0" : "justify-between")}
      >
        <Link to="/" aria-label="Thingport home" className="flex items-center rounded-control">
          {collapsed ? <BrandMark /> : <Wordmark />}
        </Link>
        {drawer ? (
          <Dialog.Close asChild>
            <IconButton label="Close menu" size="sm" noTip>
              <X className="size-[18px]" aria-hidden />
            </IconButton>
          </Dialog.Close>
        ) : collapsed ? null : (
          toggle
        )}
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {collapsed ? <div className="mx-2 mb-1 border-t border-border" /> : <GroupLabel>Library</GroupLabel>}
        {LIBRARY.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            active={item.active(pathname)}
            collapsed={collapsed}
          />
        ))}
        <Bookmarks collapsed={collapsed} pathname={pathname} />
      </nav>

      <nav aria-label="Secondary" className="flex shrink-0 flex-col gap-0.5 border-t border-border px-3 py-3">
        <NavItem
          to="/downloads"
          label="Downloads"
          icon={Download}
          active={pathname.startsWith("/downloads")}
          collapsed={collapsed}
        />
        {isAdmin ? (
          <NavItem
            to="/admin"
            label="Administration"
            icon={ShieldCheck}
            active={pathname.startsWith("/admin")}
            collapsed={collapsed}
          />
        ) : null}
        {collapsed ? <div className="mt-1 flex justify-center">{toggle}</div> : null}
      </nav>
    </>
  );
}

/** The desktop sidebar: 240px, or a 72px icon rail. Hidden below `md` (see MobileNav). */
export function Sidebar() {
  const [collapsed, toggle] = useSidebarCollapsed();
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <SidebarBody collapsed={collapsed} onToggle={toggle} />
    </aside>
  );
}

type MobileNavProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** The same navigation as a left drawer, for phones and narrow windows. */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/50 backdrop-blur-[2px] md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] animate-fade-in flex-col border-r border-border bg-surface shadow-overlay focus:outline-none md:hidden"
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <SidebarBody collapsed={false} drawer />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

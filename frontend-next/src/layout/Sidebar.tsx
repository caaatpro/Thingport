import { NavLink } from "react-router-dom";
import { Download, Folder, Layers, LayoutDashboard, Settings, Tag } from "lucide-react";
import { useAuth } from "@/app/auth";
import { cn } from "@/ui";

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg",
    isActive && "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text",
  );

const ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/models", label: "Models", icon: Layers, end: true },
  { to: "/models/collections", label: "Collections", icon: Folder, end: false },
  { to: "/models/tags", label: "Tags", icon: Tag, end: false },
];

/** Minimal sidebar so pages can be built against a real frame; the shell work replaces it. */
export function Sidebar() {
  const { isAdmin } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-3 md:flex">
      <div className="px-3 py-3 text-lg font-semibold tracking-tight">Thingport</div>
      <nav className="mt-2 flex flex-1 flex-col gap-0.5" aria-label="Main">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={link}>
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <nav className="flex flex-col gap-0.5 border-t border-border pt-3" aria-label="Secondary">
        <NavLink to="/downloads" className={link}>
          <Download className="size-4" aria-hidden />
          Downloads
        </NavLink>
        {isAdmin ? (
          <NavLink to="/admin" className={link}>
            <Settings className="size-4" aria-hidden />
            Administration
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
}

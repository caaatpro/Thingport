import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "./cn";

type MenuProps = {
  /** The element that opens the menu; must accept a ref (Button, IconButton, a plain button). */
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** A dropdown of actions: `<Menu trigger={<IconButton …/>}><MenuItem onSelect={…}>Edit</MenuItem></Menu>`. */
export function Menu({ trigger, children, align = "end", side = "bottom", open, onOpenChange, className }: MenuProps) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-[70] min-w-48 max-w-80 animate-pop-in overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-overlay",
            className,
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type ItemProps = ComponentPropsWithoutRef<typeof DropdownMenu.Item> & {
  icon?: ReactNode;
  danger?: boolean;
  /** Trailing hint, e.g. a keyboard shortcut. */
  hint?: ReactNode;
};

/** One action. With `asChild`, wrap a router `<Link>` so it stays a real link. */
export function MenuItem({ icon, danger, hint, className, children, asChild, ...props }: ItemProps) {
  const body = asChild ? (
    children
  ) : (
    <>
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </>
  );
  return (
    <DropdownMenu.Item
      asChild={asChild}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2",
        danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-fg",
        className,
      )}
      {...props}
    >
      {body}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-subtle">{children}</DropdownMenu.Label>;
}

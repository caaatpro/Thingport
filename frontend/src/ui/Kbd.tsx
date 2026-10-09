import type { ReactNode } from "react";

/** A keyboard key cap. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-border-strong bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}

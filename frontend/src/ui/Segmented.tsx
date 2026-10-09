import type { ReactNode } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "./cn";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode; "aria-label"?: string };

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Names the group for screen readers. */
  label: string;
  size?: "sm" | "md";
  /** Expose each segment as a toggle button with `aria-pressed` (view mode) instead of a radio (sort, scope). */
  pressed?: boolean;
  className?: string;
};

/** A pill-shaped single-choice switch (sort order, view mode, scope). Exposes `aria-pressed` on each segment. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  pressed,
  className,
}: Props<T>) {
  const items = options.map((o) => (
    <ToggleGroup.Item
      key={o.value}
      value={o.value}
      aria-label={o["aria-label"]}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[0.5rem] font-medium whitespace-nowrap text-muted transition-colors hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-card",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
      )}
    >
      {o.label}
    </ToggleGroup.Item>
  ));
  const rootClass = cn("inline-flex gap-0.5 rounded-control bg-surface-2 p-0.5", className);
  if (pressed) {
    // Radix gives a "single" group radio semantics; "multiple" renders real toggle buttons, so keep one value pressed.
    return (
      <ToggleGroup.Root
        type="multiple"
        value={[value]}
        // Radix labels a multi-select group a toolbar; keep the "toolbar" role for real toolbars (the bulk bar).
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="group"
        aria-label={label}
        onValueChange={(next) => {
          const picked = next.find((v) => v !== value);
          if (picked) onChange(picked as T);
        }}
        className={rootClass}
      >
        {items}
      </ToggleGroup.Root>
    );
  }
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      // Radix reports "" when the active item is pressed again; keep the current choice.
      onValueChange={(next) => next && onChange(next as T)}
      className={rootClass}
    >
      {items}
    </ToggleGroup.Root>
  );
}

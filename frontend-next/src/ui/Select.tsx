import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";

export type SelectOption = { value: string; label: string; disabled?: boolean; indent?: number };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  size?: "sm" | "md";
};

// Radix forbids an empty-string item value, so "no selection" travels as this sentinel.
const NONE = "__none__";
const toRadix = (v: string) => (v === "" ? NONE : v);

/** A single-choice dropdown. An option with `value: ""` acts as "none"/"all". */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  id,
  className,
  size = "md",
  ...aria
}: Props) {
  return (
    <RadixSelect.Root value={value === "" && !options.some((o) => o.value === "") ? undefined : toRadix(value)} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-control border border-border-strong bg-surface px-3 text-left text-sm text-fg transition-shadow hover:border-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-subtle aria-[invalid=true]:border-danger",
          size === "sm" ? "h-8" : "h-9",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon>
          <ChevronDown className="size-4 text-subtle" aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-80 min-w-[var(--radix-select-trigger-width)] animate-pop-in overflow-hidden rounded-xl border border-border bg-surface shadow-overlay"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value || NONE}
                value={toRadix(o.value)}
                disabled={o.disabled}
                style={o.indent ? { paddingLeft: `${0.625 + o.indent * 0.875}rem` } : undefined}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pr-8 pl-2.5 text-sm text-fg outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[state=checked]:font-medium"
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-2.5">
                  <Check className="size-4 text-accent-text" aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "./cn";

type Props = Omit<ComponentPropsWithoutRef<typeof RadixCheckbox.Root>, "onCheckedChange"> & {
  onCheckedChange?: (checked: boolean) => void;
  /** Visible text next to the box (also its accessible name). */
  label?: ReactNode;
};

export const Checkbox = forwardRef<HTMLButtonElement, Props>(function Checkbox(
  { className, label, onCheckedChange, ...props },
  ref,
) {
  const box = (
    <RadixCheckbox.Root
      ref={ref}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface transition-colors hover:border-subtle data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="text-accent-fg">
        {props.checked === "indeterminate" ? <Minus className="size-3.5" aria-hidden /> : <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
  if (!label) return box;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
      {box}
      {label}
    </label>
  );
});

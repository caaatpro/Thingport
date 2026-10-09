import { forwardRef, type ComponentPropsWithoutRef } from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "./cn";

export const Switch = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof RadixSwitch.Root>>(function Switch(
  { className, ...props },
  ref,
) {
  return (
    <RadixSwitch.Root
      ref={ref}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
});

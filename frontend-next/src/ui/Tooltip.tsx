import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </RadixTooltip.Provider>
  );
}

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Wraps nothing: the child must be a single element that accepts a ref. */
  disabled?: boolean;
};

/** A short hint on hover or keyboard focus. Not for anything the user needs to read to proceed. */
export function Tip({ content, children, side = "bottom", disabled }: Props) {
  if (disabled || content == null || content === "") return <>{children}</>;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[80] max-w-xs animate-fade-in rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-overlay"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

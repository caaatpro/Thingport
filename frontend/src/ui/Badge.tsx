import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const badgeStyles = cva(
  "inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted",
        outline: "border border-border bg-surface text-muted",
        accent: "bg-accent-soft text-accent-text",
        danger: "bg-danger-soft text-danger",
        warning: "bg-warning-soft text-warning",
        info: "bg-info-soft text-info",
        solid: "bg-fg text-bg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>;

/** A small label: status, tag, role. */
export function Badge({ className, tone, ...props }: Props) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />;
}

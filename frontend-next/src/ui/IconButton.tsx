import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";
import { Tip } from "./Tooltip";

const iconButtonStyles = cva(
  "inline-flex shrink-0 items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        outline: "border border-border-strong bg-surface text-muted hover:bg-surface-2 hover:text-fg",
        /** For controls laid over a thumbnail. */
        overlay: "bg-surface/90 text-fg shadow-card backdrop-blur hover:bg-surface",
        danger: "text-danger hover:bg-danger-soft",
      },
      size: { sm: "size-8", md: "size-9", lg: "size-10" },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> &
  VariantProps<typeof iconButtonStyles> & {
    /** Required: an icon alone says nothing to a screen reader. Also shown as the tooltip. */
    label: string;
    children: ReactNode;
    asChild?: boolean;
    /** Skip the tooltip (e.g. when it sits inside another tooltip). */
    noTip?: boolean;
  };

/** A square, icon-only button. `label` is the accessible name and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, className, variant, size, asChild, noTip, children, type, ...props },
  ref,
) {
  const classes = cn(iconButtonStyles({ variant, size }), className);
  const button = asChild ? (
    <Slot ref={ref} aria-label={label} className={classes} {...props}>
      {children}
    </Slot>
  ) : (
    <button ref={ref} type={type ?? "button"} aria-label={label} className={classes} {...props}>
      {children}
    </button>
  );
  return noTip ? button : <Tip content={label}>{button}</Tip>;
});

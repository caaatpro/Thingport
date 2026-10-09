import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export const buttonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-hover",
        secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        danger: "bg-danger text-white hover:opacity-90",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "h-auto rounded-none p-0 text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & {
    /** Render the child element (e.g. a router `Link`) with button styling instead of a `<button>`. */
    asChild?: boolean;
    loading?: boolean;
    icon?: ReactNode;
  };

/** Every clickable action. Pass `asChild` with a `<Link>` for navigation so it stays a real link. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, icon, children, disabled, type, ...props },
  ref,
) {
  const classes = cn(buttonStyles({ variant, size }), className);
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

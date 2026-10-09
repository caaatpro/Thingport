import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Inner spacing; `none` for cards whose content runs to the edge (thumbnails). */
  padding?: "none" | "sm" | "md" | "lg";
  /** Lift with a shadow on hover; for cards that act as links. */
  interactive?: boolean;
};

const PADDING = { none: "", sm: "p-3", md: "p-4", lg: "p-6" } as const;

/** The standard bordered surface. */
export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { className, padding = "md", interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-border bg-surface shadow-card",
        PADDING[padding],
        interactive && "transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-hover",
        className,
      )}
      {...props}
    />
  );
});

/** A card section with a heading row (title left, optional actions right). */
export function CardHeader({ title, icon, actions, className }: { title: string; icon?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
        {icon ? <span className="text-accent-text [&>svg]:size-4">{icon}</span> : null}
        {title}
      </h2>
      {actions}
    </div>
  );
}

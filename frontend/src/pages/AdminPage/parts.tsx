import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Card, cn } from "@/ui";

/** Building blocks shared by the administration pages, so they read as one family. */

/** A titled card for one group of settings or one table. */
export function AdminSection({
  title,
  description,
  actions,
  tone,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** `danger` outlines the card in red, for destructive operations. */
  tone?: "danger";
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card padding="lg" className={cn(tone === "danger" && "border-danger/40", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2
                className={cn("text-base font-semibold tracking-tight", tone === "danger" ? "text-danger" : "text-fg")}
              >
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </Card>
  );
}

/** Wraps a table so its header stays visible while the rows scroll. */
export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("max-h-[72vh] overflow-auto rounded-card border border-border bg-surface", className)}>
      {children}
    </div>
  );
}

export const TABLE = "w-full border-separate border-spacing-0 text-sm";
export const TH =
  "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted uppercase";
export const TD = "border-b border-border px-3 py-2.5 align-middle";
export const TR = "transition-colors hover:bg-surface-2/60";

/** A load failure with a retry, for any admin query. */
export function LoadError({
  error,
  onRetry,
  title = "Couldn't load this",
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {errorMessage(error, "Check your connection and try again.")}
    </Alert>
  );
}

/** All accounts, as the administration pages see them. */
export function useAdminUsers() {
  return useQuery({ queryKey: ["admin", "users"], queryFn: () => adminApi.listUsers() });
}

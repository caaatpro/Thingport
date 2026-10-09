import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "./cn";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 aria-label={label} className={cn("size-5 animate-spin text-subtle", className)} />;
}

/** A centered spinner for a page or panel that is still loading. */
export function PageLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center py-20", className)}>
      <Spinner className="size-6" />
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-2", className)} {...props} />;
}

const ALERT_TONES = {
  info: { box: "border-info/30 bg-info-soft text-info", Icon: Info },
  success: { box: "border-success/30 bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning/30 bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { box: "border-danger/30 bg-danger-soft text-danger", Icon: XCircle },
} as const;

type AlertProps = {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** An inline message. `danger` and `warning` are announced to screen readers. */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  const { box, Icon } = ALERT_TONES[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : undefined}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-fg/80")}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

type EmptyProps = { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string };

/** Shown where a list would be when there is nothing to list. */
export function EmptyState({ icon, title, children, action, className }: EmptyProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-16 text-center", className)}>
      {icon ? <div className="mb-1 text-subtle [&>svg]:size-10 [&>svg]:stroke-[1.25]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {children ? <p className="max-w-md text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

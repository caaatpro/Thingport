import type { ReactNode } from "react";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { IconButton } from "./IconButton";
import { cn } from "./cn";

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Shows a back arrow linking here (a real link, so it opens in a new tab too). */
  backTo?: string;
  backLabel?: string;
  /** Right-aligned primary actions. Keep the important ones visible; put the rest in a Menu. */
  actions?: ReactNode;
  className?: string;
};

/** The page's one <h1>. Also sets the browser tab title. */
export function PageHeader({ title, subtitle, backTo, backLabel = "Back", actions, className }: Props) {
  useEffect(() => {
    document.title = `${title} · Thingport`;
    return () => {
      document.title = "Thingport";
    };
  }, [title]);
  return (
    <header className={cn("mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {backTo ? (
          <IconButton label={backLabel} variant="outline" asChild>
            <Link to={backTo}>
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </IconButton>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle ? <div className="mt-0.5 text-sm text-muted">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

import { Lock, Users } from "lucide-react";
import { Tip, cn } from "@/ui";

type Props = {
  visibility?: "private" | "shared";
  /** When the resource is shared with the viewer by someone else. */
  ownerName?: string | null;
  /** Icon only; the text moves to the tooltip and the accessible name. */
  compact?: boolean;
  className?: string;
};

/** Private / Shared pill, used on cards and detail pages. */
export function VisibilityBadge({ visibility, ownerName, compact, className }: Props) {
  const shared = visibility === "shared";
  const label = ownerName ? `Shared by ${ownerName}` : shared ? "Shared" : "Private";
  const Icon = shared || ownerName ? Users : Lock;
  const badge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface text-xs font-medium text-muted",
        compact ? "size-6 justify-center" : "h-6 px-2",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
  return compact ? <Tip content={label}>{badge}</Tip> : badge;
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/ui";

type Props = { icon: ReactNode; count: number; label: string; to?: string };

/** A headline number. A tile with a destination is a real link. */
export function StatTile({ icon, count, label, to }: Props) {
  const body = (
    <Card className="flex items-center gap-4" interactive={Boolean(to)}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-text [&>svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold tracking-tight text-fg">{count.toLocaleString()}</span>
        <span className="block truncate text-sm text-muted">{label}</span>
      </span>
    </Card>
  );
  if (!to) return <div>{body}</div>;
  return (
    <Link to={to} className="block rounded-card">
      {body}
    </Link>
  );
}

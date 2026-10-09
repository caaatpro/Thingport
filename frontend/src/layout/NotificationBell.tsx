import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ExternalLink } from "lucide-react";
import { notificationsApi, type Notification, type NotificationsListResult } from "@/api/notifications";
import { IconButton, Popover, Skeleton, cn } from "@/ui";

// Catches notifications from other tabs and devices; imports in this tab refresh the list directly.
const POLL_MS = 45_000;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.round(hours / 24), "day");
}

function Entry({ item, fresh, onNavigate }: { item: Notification; fresh: boolean; onNavigate: () => void }) {
  const content = (
    <>
      <span className="flex items-start gap-2">
        <span className={cn("min-w-0 flex-1 text-sm text-fg", fresh ? "font-semibold" : "font-normal")}>
          {item.title}
        </span>
        {fresh ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
      </span>
      {item.body ? <span className="mt-0.5 block text-xs text-muted">{item.body}</span> : null}
      <span className="mt-1 block text-xs text-subtle">{relativeTime(item.created_at)}</span>
    </>
  );
  const box = "block px-4 py-3";
  return (
    <li className="border-b border-border last:border-b-0">
      {item.internal_path ? (
        <Link to={item.internal_path} onClick={onNavigate} className={cn(box, "hover:bg-surface-2")}>
          {content}
        </Link>
      ) : (
        <div className={box}>{content}</div>
      )}
      {item.external_url ? (
        <a
          href={item.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="-mt-1 mb-2.5 ml-4 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
        >
          View source
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

/** Bell with an unread badge. Opening the list marks everything read, but what was new stays emphasised until it closes. */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(),
    refetchInterval: POLL_MS,
  });
  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () =>
      queryClient.setQueryData<NotificationsListResult>(["notifications"], (prev) =>
        prev ? { unread_count: 0, items: prev.items.map((n) => ({ ...n, read: true })) } : prev,
      ),
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setFreshIds(new Set(items.filter((n) => !n.read).map((n) => n.id)));
    if (unread > 0) markAllRead.mutate();
  };

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden p-0"
      trigger={
        <IconButton label={label} className="relative">
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </IconButton>
      }
    >
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">Notifications</div>
      <div className="max-h-[26rem] overflow-y-auto">
        {isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : isError ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Couldn’t load notifications.{" "}
            <button
              type="button"
              className="font-medium text-accent-text hover:underline"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <Entry key={item.id} item={item} fresh={freshIds.has(item.id)} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
        )}
      </div>
    </Popover>
  );
}

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { adminApi, type LogAction, type LogEntry } from "@/api/admin";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Skeleton, type SelectOption } from "@/ui";
import { LoadError, TABLE, TD, TH, TR, TableScroll, useAdminUsers } from "../AdminPage/parts";

type Tone = "accent" | "danger" | "info" | "warning" | "neutral";

const ACTIONS: Record<LogAction, { label: string; tone: Tone }> = {
  user_logged_in: { label: "Logged in", tone: "accent" },
  user_logged_out: { label: "Logged out", tone: "neutral" },
  password_reset_requested: { label: "Requested a password reset", tone: "neutral" },
  password_reset: { label: "Reset password", tone: "warning" },
  user_invited: { label: "Invited a user", tone: "info" },
  user_created: { label: "User created", tone: "accent" },
  user_updated: { label: "User edited", tone: "warning" },
  user_role_changed: { label: "Role changed", tone: "warning" },
  user_disabled: { label: "User disabled", tone: "danger" },
  user_enabled: { label: "User enabled", tone: "accent" },
  user_deleted: { label: "User deleted", tone: "danger" },
  user_signed_out: { label: "User signed out by an admin", tone: "warning" },
  password_reset_link_created: { label: "Password reset link created", tone: "warning" },
  processing_retried: { label: "Processing retried", tone: "info" },
  authors_linked: { label: "Linked missing authors", tone: "accent" },
  model_uploaded: { label: "Model uploaded", tone: "info" },
  model_imported: { label: "Model imported", tone: "info" },
  import_completed: { label: "Import completed", tone: "info" },
  model_edited: { label: "Model edited", tone: "warning" },
  model_deleted: { label: "Model deleted", tone: "danger" },
  collection_created: { label: "Collection created", tone: "accent" },
  collection_edited: { label: "Collection edited", tone: "warning" },
  collection_deleted: { label: "Collection deleted", tone: "danger" },
  collection_item_added: { label: "Added to collection", tone: "info" },
  collection_item_removed: { label: "Removed from collection", tone: "neutral" },
};

const PAGE_SIZE = 100;

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function formatDetails(log: LogEntry): string {
  const d = log.details;
  switch (log.action) {
    case "model_uploaded":
    case "model_imported":
    case "model_deleted":
    case "collection_created":
    case "collection_edited":
    case "collection_deleted":
    case "collection_item_added":
    case "collection_item_removed":
      return typeof d.name === "string" ? d.name : "";
    case "user_invited":
      return typeof d.email === "string" ? d.email : "";
    case "authors_linked":
      return `${typeof d.linked === "number" ? d.linked : 0} model(s) linked`;
    case "model_edited":
      return typeof d.field === "string" ? `Edited ${d.field}` : "";
    case "import_completed": {
      const provider = typeof d.provider === "string" ? d.provider : "";
      const label = typeof d.sourceLabel === "string" && d.sourceLabel ? d.sourceLabel : provider;
      const imported = typeof d.imported === "number" ? d.imported : 0;
      const failed = typeof d.failed === "number" ? d.failed : 0;
      return `${label} — ${imported} imported, ${failed} failed`;
    }
    default:
      return "";
  }
}

/** One entry per action, not per file: a batch import is a single row. */
export default function LogsPage() {
  // The filters live in the URL, so `?user=<id>` from the users table (and any filtered view) can be shared.
  const [params, setParams] = useSearchParams();
  const userId = params.get("user") ?? "";
  const from = params.get("from") ?? defaultFrom();
  const to = params.get("to") ?? "";

  const setParam = (key: "user" | "from" | "to", value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // An emptied "from" is kept as an empty value so it doesn't snap back to the default week.
        if (value || key === "from") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const usersQuery = useAdminUsers();
  const userOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "All users" },
      ...(usersQuery.data ?? []).map((u) => ({ value: u.id, label: `${u.display_name} (${u.email})` })),
    ],
    [usersQuery.data],
  );

  const logsQuery = useQuery({
    queryKey: ["admin", "logs", { userId, from, to }],
    queryFn: () => adminApi.listLogs({ userId: userId || undefined, from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Logs" subtitle="Who did what, and when." backTo="/admin" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <Field label="User" className="w-full sm:w-72">
            {(p) => <Select id={p.id} value={userId} onChange={(v) => setParam("user", v)} options={userOptions} />}
          </Field>
          <Field label="From">{(p) => <Input {...p} type="date" value={from} max={to || undefined} onChange={(e) => setParam("from", e.target.value)} />}</Field>
          <Field label="To">{(p) => <Input {...p} type="date" value={to} min={from || undefined} onChange={(e) => setParam("to", e.target.value)} />}</Field>
        </div>

        {logsQuery.isPending ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : logsQuery.isError ? (
          <LoadError error={logsQuery.error} title="Unable to load logs." onRetry={() => void logsQuery.refetch()} />
        ) : logsQuery.data.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="No log entries for this filter." className="rounded-card border border-border bg-surface">
            Widen the date range or pick another user.
          </EmptyState>
        ) : (
          // Keyed by the filter so a new search starts at the first page again.
          <LogTable key={`${userId}|${from}|${to}`} logs={logsQuery.data} />
        )}
      </div>
    </div>
  );
}

function LogTable({ logs }: { logs: LogEntry[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const rows = logs.slice(0, shown);
  return (
    <>
      <TableScroll>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>User</th>
              <th className={TH}>Action</th>
              <th className={TH}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => {
              const action = ACTIONS[log.action] ?? { label: log.action, tone: "neutral" as const };
              return (
                <tr key={log.id} className={TR}>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-muted`}>{new Date(log.created_at).toLocaleString()}</td>
                  <td className={TD}>
                    <div className="font-medium text-fg">{log.user_display_name}</div>
                    <div className="text-xs text-muted">{log.user_email}</div>
                  </td>
                  <td className={TD}>
                    <Badge tone={action.tone}>{action.label}</Badge>
                  </td>
                  <td className={`${TD} text-muted`}>{formatDetails(log)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span>
          Showing {rows.length} of {logs.length}
        </span>
        {rows.length < logs.length ? (
          <Button onClick={() => setShown((n) => n + PAGE_SIZE)}>Show more</Button>
        ) : null}
      </div>
    </>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CollectionRole, ShareUser } from "@/api/prints";
import { usersApi } from "@/api/users";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Checkbox, Input, Modal, PageLoading, Select } from "@/ui";
import { PRINT_QUERY_PREFIXES } from "@/features/prints/queryKeys";

const ROLE_OPTIONS: { value: CollectionRole; label: string }[] = [
  { value: "view", label: "Can view" },
  { value: "upload", label: "Can upload" },
  { value: "edit", label: "Can edit" },
  { value: "delete", label: "Can delete" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resource name, shown in the title. */
  name: string;
  /** Extra explanation under the summary, e.g. what sharing a collection includes. */
  hint?: string;
  loadShares: () => Promise<ShareUser[]>;
  /** `roles` is only meaningful with `withRoles`. */
  saveShares: (userIds: string[], roles: Record<string, CollectionRole>) => Promise<unknown>;
  /** Collections: each person gets a role (view, upload, edit, delete). */
  withRoles?: boolean;
  onSaved?: () => void;
};

/** Targeted-sharing picker: choose which members can see a model or collection. */
export function ShareDialog({
  open,
  onOpenChange,
  name,
  hint,
  loadShares,
  saveShares,
  withRoles = false,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const instance = useId();
  const queryKey = useMemo(() => ["users", "share-dialog", instance], [instance]);
  // The caller passes fresh closures every render; the query only needs the latest one when it runs.
  const loadRef = useRef(loadShares);
  useEffect(() => {
    loadRef.current = loadShares;
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, CollectionRole>>({});
  const [filter, setFilter] = useState("");

  const data = useQuery({
    queryKey,
    queryFn: async () => {
      const [users, shares] = await Promise.all([usersApi.list(), loadRef.current()]);
      return { users, shares };
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  // Start every opening from the server's state.
  useEffect(() => {
    if (!open) {
      queryClient.removeQueries({ queryKey });
      return;
    }
    setFilter("");
  }, [open, queryClient, queryKey]);
  useEffect(() => {
    if (!data.data) return;
    setSelected(new Set(data.data.shares.map((s) => s.user_id)));
    setRoles(Object.fromEntries(data.data.shares.map((s) => [s.user_id, s.role ?? "view"])));
  }, [data.data]);

  const users = data.data?.users;
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (users ?? []).filter(
      (u) => !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, filter]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = useMutation({
    mutationFn: () => saveShares([...selected], roles),
    onSuccess: async () => {
      await Promise.all(PRINT_QUERY_PREFIXES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      onSaved?.();
      onOpenChange(false);
    },
  });

  const loading = open && data.isPending;
  const error = save.isError
    ? errorMessage(save.error, "Couldn't update sharing.")
    : data.isError
      ? errorMessage(data.error, "Couldn't load sharing.")
      : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Share "${name}"`}
      size="md"
      locked={save.isPending}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={loading || data.isError}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {selected.size > 0
            ? `Shared with ${selected.size} ${selected.size === 1 ? "person" : "people"}.`
            : "Private — only you can see this."}
        </p>
        {withRoles && selected.size > 0 ? (
          <p className="text-xs text-muted">
            View: see and download. Upload: also add models. Edit: also change details and files, and take models out.
            Delete: also delete models. Only you can share or delete the collection.
          </p>
        ) : null}
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {loading ? (
          <PageLoading className="py-6" />
        ) : users && users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No other members to share with yet.</p>
        ) : users ? (
          <>
            <Input
              type="search"
              aria-label="Search members"
              placeholder="Search members…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="max-h-72 overflow-y-auto rounded-control border border-border">
              {filtered.map((u) => (
                <li key={u.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
                  <label
                    htmlFor={`${instance}-${u.id}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                  >
                    <Checkbox
                      id={`${instance}-${u.id}`}
                      checked={selected.has(u.id)}
                      onCheckedChange={() => toggle(u.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{u.display_name}</span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                    </span>
                  </label>
                  {withRoles && selected.has(u.id) ? (
                    <Select
                      size="sm"
                      className="w-36"
                      value={roles[u.id] ?? "view"}
                      onChange={(role) => setRoles((prev) => ({ ...prev, [u.id]: role as CollectionRole }))}
                      aria-label={`Permission for ${u.display_name}`}
                      options={ROLE_OPTIONS}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

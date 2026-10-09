import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  History,
  KeyRound,
  LogOut,
  MoreVertical,
  Pencil,
  Search,
  Shield,
  Trash2,
  Trash,
  User,
  UserPlus,
} from "lucide-react";
import { adminApi, type AdminUser } from "@/api/admin";
import { useUser } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  PageHeader,
  Segmented,
  Skeleton,
  useConfirm,
  useToast,
} from "@/ui";
import { formatFileSize } from "@/utils/fileSize";
import { LoadError, TABLE, TD, TH, TR, TableScroll, useAdminUsers } from "../AdminPage/parts";
import CreateUserDialog from "./CreateUserDialog";
import RegistrationsPanel from "./RegistrationsPanel";
import { DeleteUserDialog, EditUserDialog, ResetLinkDialog, SignOutDialog } from "./UserDialogs";

type Filter = "all" | "admins" | "members" | "disabled";
type Dialog = { kind: "edit" | "reset" | "signOut" | "delete"; user: AdminUser } | null;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "admins", label: "Admins" },
  { value: "members", label: "Members" },
  { value: "disabled", label: "Disabled" },
];

const DAY_MS = 24 * 3600 * 1000;
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function lastActive(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const diff = new Date(iso).getTime() - now;
  const days = Math.round(diff / DAY_MS);
  if (Math.abs(days) >= 1) return relative.format(days, "day");
  const hours = Math.round(diff / 3600000);
  if (Math.abs(hours) >= 1) return relative.format(hours, "hour");
  return relative.format(Math.round(diff / 60000), "minute");
}

function isFilter(value: string | null): value is Filter {
  return value === "all" || value === "admins" || value === "members" || value === "disabled";
}

const roleLabel = (role: AdminUser["role"]) => (role === "ADMIN" ? "Admin" : "Member");

/** Accounts of the instance, with search, filters and everything an admin needs to manage them. */
export default function UsersPage() {
  const me = useUser();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Fixed at mount: "last active" doesn't need to tick, and render must stay pure.
  const [now] = useState(() => Date.now());
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const filterParam = params.get("filter");
  const filter: Filter = isFilter(filterParam) ? filterParam : "all";
  const [dialog, setDialog] = useState<Dialog>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const usersQuery = useAdminUsers();
  const users = usersQuery.data;

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (filter === "admins" && u.role !== "ADMIN") return false;
      if (filter === "members" && u.role !== "MEMBER") return false;
      if (filter === "disabled" && !u.disabled) return false;
      return !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
    });
  }, [users, query, filter]);

  const counts = useMemo(
    () => ({
      total: users?.length ?? 0,
      admins: users?.filter((u) => u.role === "ADMIN").length ?? 0,
      disabled: users?.filter((u) => u.disabled).length ?? 0,
    }),
    [users],
  );

  const changed = async (message?: string) => {
    if (message) toast.success(message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
    ]);
  };

  const update = useMutation({
    mutationFn: ({
      user,
      patch,
    }: {
      user: AdminUser;
      patch: Parameters<typeof adminApi.updateUser>[1];
      message: string;
    }) => adminApi.updateUser(user.id, patch),
    onSuccess: (_res, { message }) => changed(message),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const deleteModels = useMutation({
    mutationFn: (user: AdminUser) => adminApi.deleteAllPrintsForUser(user.id),
    onSuccess: (res) => changed(`Deleted ${res.deleted} models.`),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleDisabled = async (user: AdminUser) => {
    if (!user.disabled) {
      const ok = await confirm({
        title: `Disable ${user.display_name}?`,
        message:
          "They are signed out at once and can't sign in or use API tokens until you enable the account again. Their models stay as they are.",
        confirmLabel: "Disable",
        destructive: true,
      });
      if (!ok) return;
    }
    update.mutate({
      user,
      patch: { disabled: !user.disabled },
      message: user.disabled ? `${user.display_name} can sign in again.` : `${user.display_name} was disabled.`,
    });
  };

  const removeModels = async (user: AdminUser) => {
    const ok = await confirm({
      title: `Delete all models of ${user.display_name}?`,
      message: `${user.print_count} models and their files are permanently deleted. The account itself stays.`,
      confirmLabel: "Delete models",
      destructive: true,
    });
    if (ok) deleteModels.mutate(user);
  };

  const changeRole = (user: AdminUser) => {
    const next = user.role === "ADMIN" ? "MEMBER" : "ADMIN";
    update.mutate({ user, patch: { role: next }, message: `${user.display_name} is now ${roleLabel(next)}.` });
  };

  const closeDialog = () => setDialog(null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Users"
        subtitle="Accounts, roles and access to this instance."
        backTo="/admin"
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
            Add user
          </Button>
        }
      />

      <div className="space-y-4">
        <RegistrationsPanel />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search users"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setParam("q", e.target.value)}
              className="pl-9"
            />
          </div>
          <Segmented label="Show" value={filter} onChange={(v) => setParam("filter", v)} options={FILTERS} />
          {users ? (
            <p className="ml-auto text-sm text-muted">{`${counts.total} users · ${counts.admins} admins · ${counts.disabled} disabled`}</p>
          ) : null}
        </div>

        {usersQuery.isPending ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <LoadError error={usersQuery.error} title="Unable to load users." onRetry={() => void usersQuery.refetch()} />
        ) : (
          <TableScroll>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>User</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Models</th>
                  <th className={`${TH} text-right`}>Storage</th>
                  <th className={TH}>Last active</th>
                  <th className={TH}>Created</th>
                  <th className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const isSelf = u.id === me.id;
                  return (
                    <tr key={u.id} className={TR}>
                      {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                      <td className={TD}>
                        <div className={`flex items-center gap-3 ${u.disabled ? "opacity-60" : ""}`}>
                          <span
                            aria-hidden
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-muted"
                          >
                            {(u.display_name || u.email).slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-fg">{u.display_name}</span>
                              {isSelf ? <Badge tone="accent">You</Badge> : null}
                            </div>
                            <div className="truncate text-xs text-muted">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={TD}>
                        <Badge tone={u.role === "ADMIN" ? "accent" : "outline"}>{roleLabel(u.role)}</Badge>
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={u.disabled ? "danger" : "outline"}>{u.disabled ? "Disabled" : "Active"}</Badge>
                          {!u.email_verified ? <Badge tone="warning">Email not verified</Badge> : null}
                        </div>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{u.print_count}</td>
                      <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                        {u.storage_bytes ? formatFileSize(u.storage_bytes) : "—"}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <span title={u.last_login_at ? new Date(u.last_login_at).toLocaleString() : undefined}>
                          {lastActive(u.last_login_at, now)}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-muted`}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className={`${TD} w-12 text-right`}>
                        <Menu
                          trigger={
                            <IconButton label="User actions" size="sm">
                              <MoreVertical className="size-4" />
                            </IconButton>
                          }
                        >
                          <MenuItem icon={<Pencil />} onSelect={() => setDialog({ kind: "edit", user: u })}>
                            Edit name…
                          </MenuItem>
                          {!isSelf ? (
                            <MenuItem icon={u.role === "ADMIN" ? <User /> : <Shield />} onSelect={() => changeRole(u)}>
                              {u.role === "ADMIN" ? "Make regular member" : "Make administrator"}
                            </MenuItem>
                          ) : null}
                          <MenuItem icon={<KeyRound />} onSelect={() => setDialog({ kind: "reset", user: u })}>
                            Password reset link…
                          </MenuItem>
                          <MenuItem icon={<LogOut />} onSelect={() => setDialog({ kind: "signOut", user: u })}>
                            Sign out everywhere…
                          </MenuItem>
                          <MenuItem asChild>
                            <Link to={`/admin-logs?user=${u.id}`} className="flex items-center gap-2.5">
                              <History className="size-4" aria-hidden />
                              View activity
                            </Link>
                          </MenuItem>
                          <MenuSeparator />
                          {!isSelf ? (
                            <MenuItem
                              icon={u.disabled ? <CheckCircle2 /> : <Ban />}
                              onSelect={() => void toggleDisabled(u)}
                            >
                              {u.disabled ? "Enable account" : "Disable account"}
                            </MenuItem>
                          ) : null}
                          <MenuItem
                            danger
                            icon={<Trash />}
                            disabled={u.print_count === 0}
                            onSelect={() => void removeModels(u)}
                          >
                            Delete all models…
                          </MenuItem>
                          {!isSelf ? (
                            <MenuItem danger icon={<Trash2 />} onSelect={() => setDialog({ kind: "delete", user: u })}>
                              Delete user…
                            </MenuItem>
                          ) : null}
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 ? (
              <EmptyState title="No users match." className="py-10">
                Try a different search or filter.
              </EmptyState>
            ) : null}
          </TableScroll>
        )}
      </div>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => void changed()} />
      {dialog?.kind === "edit" ? <EditUserDialog user={dialog.user} onClose={closeDialog} onChanged={changed} /> : null}
      {dialog?.kind === "reset" ? <ResetLinkDialog user={dialog.user} onClose={closeDialog} /> : null}
      {dialog?.kind === "signOut" ? (
        <SignOutDialog user={dialog.user} onClose={closeDialog} onChanged={changed} />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteUserDialog user={dialog.user} onClose={closeDialog} onChanged={changed} />
      ) : null}
    </div>
  );
}

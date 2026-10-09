import { useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { adminApi, type AdminUser } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Modal, PageHeader, Select, Skeleton, useToast } from "@/ui";
import { AdminSection, LoadError, useAdminUsers } from "../AdminPage/parts";
import LinkAuthorsSection from "./LinkAuthorsSection";

/** One-off operations on other users' data or the whole instance. */
export default function TriggersPage() {
  const usersQuery = useAdminUsers();
  const [selectedId, setSelectedId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const options = useMemo(
    () =>
      (usersQuery.data ?? []).map((u) => ({
        value: u.id,
        label: `${u.display_name} (${u.email}) — ${u.print_count} models`,
      })),
    [usersQuery.data],
  );
  const selected = usersQuery.data?.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Triggers"
        subtitle="One-off maintenance jobs. Each one runs once, when you ask."
        backTo="/admin"
      />
      <div className="space-y-4">
        <LinkAuthorsSection />

        <AdminSection
          title="Delete all models for a user"
          description="Permanently deletes every model a user created, uploaded, or imported, files included. Their categories and collections are left in place, just empty."
          tone="danger"
        >
          {usersQuery.isPending ? (
            <Skeleton className="h-9 max-w-md" />
          ) : usersQuery.isError ? (
            <LoadError
              error={usersQuery.error}
              title="Unable to load users."
              onRetry={() => void usersQuery.refetch()}
            />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="User" className="w-full sm:w-96">
                {(p) => (
                  <Select
                    id={p.id}
                    value={selectedId}
                    onChange={setSelectedId}
                    options={options}
                    placeholder="Choose a user"
                  />
                )}
              </Field>
              <Button
                variant="danger"
                icon={<Trash2 className="size-4" />}
                disabled={!selected || !selected.print_count}
                onClick={() => setConfirming(true)}
              >
                Delete all models…
              </Button>
            </div>
          )}
        </AdminSection>
      </div>

      {confirming && selected ? <DeleteAllModelsDialog user={selected} onClose={() => setConfirming(false)} /> : null}
    </div>
  );
}

/** Wipes a person's library, so the admin types their email to confirm. */
function DeleteAllModelsDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const formId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  const remove = useMutation({
    mutationFn: () => adminApi.deleteAllPrintsForUser(user.id),
    onSuccess: async (res) => {
      toast.success(`Deleted ${res.deleted} model(s) for ${user.email}.`);
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin"] }),
        queryClient.invalidateQueries({ queryKey: ["prints"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delete all models for this user?"
      locked={remove.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={remove.isPending} disabled={!matches}>
            Delete all models
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches && !remove.isPending) remove.mutate();
        }}
      >
        <Alert tone="warning">
          This permanently deletes all {user.print_count} model(s) belonging to {user.email}, including their files.
          This cannot be undone.
        </Alert>
        {remove.error ? (
          <Alert tone="danger">{errorMessage(remove.error, "Failed to delete this user's models.")}</Alert>
        ) : null}
        <Field label={`Type ${user.email} to confirm`}>
          {(p) => (
            <Input
              {...p}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={user.email}
              autoComplete="off"
              disabled={remove.isPending}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

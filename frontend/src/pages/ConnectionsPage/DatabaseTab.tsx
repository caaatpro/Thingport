import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Skeleton, useConfirm, useToast } from "@/ui";
import { AdminSection, LoadError } from "../AdminPage/parts";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-fg">{value}</dd>
    </div>
  );
}

/** Host/port are fixed at startup. "Test & Save" verifies new credentials before switching, and the
 *  switch doesn't survive a restart. */
export default function DatabaseTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const query = useQuery({ queryKey: ["settings", "database"], queryFn: () => settingsApi.getDatabase() });
  // null = untouched: the field shows what the server reports.
  const [database, setDatabase] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const info = query.data;
  const dbName = (database ?? info?.database ?? "").trim();
  const dbUser = (user ?? info?.user ?? "").trim();

  const save = useMutation({
    mutationFn: () => settingsApi.testAndSaveDatabase({ database: dbName, user: dbUser, password }),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings", "database"], next);
      setDatabase(null);
      setUser(null);
      setPassword("");
      toast.success("Connected and switched.");
    },
  });

  if (query.isPending) return <Skeleton className="h-80" />;
  if (query.isError || !info) {
    return <LoadError error={query.error} title="Unable to load database info." onRetry={() => void query.refetch()} />;
  }

  const unset = "—";
  const dirty = dbName !== (info.database ?? "") || dbUser !== (info.user ?? "") || password.trim() !== "";
  const canSubmit = dirty && Boolean(dbName && dbUser && password.trim());

  const submit = async () => {
    const ok = await confirm({
      title: "Switch the live database?",
      message: (
        <>
          <p>
            This repoints every database call this running instance makes at a different database. If the new
            credentials are wrong or unreachable, the switch is rejected and nothing changes.
          </p>
          <p className="mt-2">
            Switch to database &quot;{dbName}&quot; as user &quot;{dbUser}&quot;? This does not persist across a
            restart. Update DATABASE_URL if you want it to stick.
          </p>
        </>
      ),
      confirmLabel: "Test & Save",
    });
    if (ok) save.mutate();
  };

  return (
    <AdminSection
      title="Database"
      description="Host and port always reflect the DATABASE_URL this instance was started with and can't be changed here. Database, user, and password can be switched live: the new credentials are tested before anything is applied, so a typo can't take the app down, but the switch only affects this running process and won't survive a restart."
    >
      <form
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !save.isPending) void submit();
        }}
      >
        <dl className="space-y-1.5 rounded-control bg-surface-2 p-3">
          <Row label="Host" value={info.host ?? unset} />
          <Row label="Port" value={info.port ? String(info.port) : unset} />
        </dl>
        <Field label="Database">
          {(p) => (
            <Input
              {...p}
              value={database ?? info.database ?? ""}
              disabled={save.isPending}
              onChange={(e) => setDatabase(e.target.value)}
            />
          )}
        </Field>
        <Field label="User">
          {(p) => (
            <Input
              {...p}
              value={user ?? info.user ?? ""}
              autoComplete="off"
              disabled={save.isPending}
              onChange={(e) => setUser(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password">
          {(p) => (
            <Input
              {...p}
              type="password"
              value={password}
              placeholder="Required to test and apply a switch"
              autoComplete="new-password"
              disabled={save.isPending}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        {save.error ? <Alert tone="danger">{errorMessage(save.error, "Failed to switch database.")}</Alert> : null}
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!canSubmit}>
            Test &amp; Save
          </Button>
        </div>
      </form>
    </AdminSection>
  );
}

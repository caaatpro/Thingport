import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type SmtpSettings } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Skeleton, Switch, useToast } from "@/ui";
import { AdminSection, LoadError } from "../AdminPage/parts";

/** Leaving Host blank turns email verification off. */
export default function SmtpTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["settings", "smtp"], queryFn: () => settingsApi.getSmtp() });
  // null = untouched: the form shows the saved settings. The password is write-only and always starts empty.
  const [draft, setDraft] = useState<SmtpSettings | null>(null);
  const [password, setPassword] = useState("");

  const settings = draft ?? query.data;
  const patch = (change: Partial<SmtpSettings>) => settings && setDraft({ ...settings, ...change });

  const save = useMutation({
    mutationFn: (s: SmtpSettings) =>
      settingsApi.updateSmtp({
        host: s.host,
        port: s.port,
        secure: s.secure,
        user: s.user,
        from: s.from,
        ...(password.trim() ? { pass: password.trim() } : {}),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings", "smtp"], next);
      setDraft(null);
      setPassword("");
      toast.success("SMTP settings saved.");
    },
  });

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError || !settings) {
    return <LoadError error={query.error} title="Unable to load SMTP settings." onRetry={() => void query.refetch()} />;
  }
  const busy = save.isPending;

  return (
    <AdminSection
      title="SMTP"
      description="Used to send the account-verification email on registration. Leave Host blank to turn email verification off entirely: new accounts are then verified and signed in immediately."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) save.mutate(settings);
        }}
      >
        <Alert tone={query.data.configured ? "success" : "warning"}>
          {query.data.configured
            ? "SMTP is configured: new accounts must verify their email before signing in."
            : "SMTP is not configured: new accounts are verified and signed in immediately."}
        </Alert>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Host">
            {(p) => <Input {...p} value={settings.host ?? ""} placeholder="smtp.example.com" disabled={busy} onChange={(e) => patch({ host: e.target.value })} />}
          </Field>
          <Field label="Port">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={65535}
                value={settings.port}
                disabled={busy}
                onChange={(e) => patch({ port: Number(e.target.value) || settings.port })}
              />
            )}
          </Field>
        </div>
        <div className="flex items-start gap-3">
          <Switch id="smtp-secure" checked={settings.secure} disabled={busy} onCheckedChange={(secure) => patch({ secure })} className="mt-0.5" />
          <div>
            <label htmlFor="smtp-secure" className="text-sm font-medium text-fg">
              Use implicit TLS
            </label>
            <p className="text-sm text-muted">Enable for port 465. Leave off for STARTTLS on port 587.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username">
            {(p) => <Input {...p} value={settings.user ?? ""} autoComplete="off" disabled={busy} onChange={(e) => patch({ user: e.target.value })} />}
          </Field>
          <Field label="Password">
            {(p) => (
              <Input
                {...p}
                type="password"
                value={password}
                placeholder="Leave blank to keep the current password"
                autoComplete="new-password"
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="From address">
          {(p) => (
            <Input {...p} value={settings.from} placeholder="Thingport <no-reply@example.com>" disabled={busy} onChange={(e) => patch({ from: e.target.value })} />
          )}
        </Field>
        {save.error ? <Alert tone="danger">{errorMessage(save.error, "Failed to save SMTP settings.")}</Alert> : null}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </AdminSection>
  );
}

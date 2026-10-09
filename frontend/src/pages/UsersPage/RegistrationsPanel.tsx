import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Card, Switch, useToast } from "@/ui";
import InviteUsersDialog from "./InviteUsersDialog";

/** Closed registrations still admit the first account and invitees. Inviting needs SMTP. */
export default function RegistrationsPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);

  const registrations = useQuery({
    queryKey: ["settings", "registrations"],
    queryFn: () => settingsApi.getRegistrations(),
  });
  const smtp = useQuery({ queryKey: ["settings", "smtp"], queryFn: () => settingsApi.getSmtp() });

  const update = useMutation({
    mutationFn: (next: boolean) => settingsApi.updateRegistrations(next),
    onSuccess: (res) => queryClient.setQueryData(["settings", "registrations"], res),
    onError: (err) => toast.error(errorMessage(err, "Failed to update registration settings")),
  });

  const allow = update.isPending ? Boolean(update.variables) : (registrations.data?.allow_registrations ?? true);
  const canInvite = !allow && Boolean(smtp.data?.configured);
  const id = "allow-registrations";

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Switch
            id={id}
            checked={allow}
            disabled={registrations.isPending || update.isPending}
            onCheckedChange={(v) => update.mutate(v)}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <label htmlFor={id} className="text-sm font-medium text-fg">
              Allow new registrations
            </label>
            <p className="text-sm text-muted">
              {allow
                ? "Anyone who can reach this instance can create an account from the sign-in page."
                : "The sign-in page has no Register option, and new accounts can only be created from an invitation."}
            </p>
          </div>
        </div>
        {canInvite ? (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button icon={<UserPlus className="size-4" />} onClick={() => setInviteOpen(true)}>
              Invite users
            </Button>
            <p className="text-xs text-muted">
              Sends a registration link by email. It works for one address, once, for 7 days.
            </p>
          </div>
        ) : null}
      </div>
      {registrations.isError ? (
        <Alert tone="warning" className="mt-3">
          Couldn&apos;t load the registration setting.
        </Alert>
      ) : null}
      <InviteUsersDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Card>
  );
}

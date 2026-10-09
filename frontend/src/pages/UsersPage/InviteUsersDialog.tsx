import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Modal } from "@/ui";

/** Stays open after sending, so several people can be invited in a row. */
export default function InviteUsersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <InviteForm onClose={onClose} /> : null;
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [email, setEmail] = useState("");
  const invite = useMutation({
    mutationFn: (address: string) => adminApi.inviteUser(address),
    onSuccess: () => setEmail(""),
  });
  const sent = invite.data;
  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title="Invite a user"
      description="They'll get an email with a link to create their account. Only this address can use it."
      size="sm"
      locked={invite.isPending}
      hideClose
      footer={
        <>
          <Button onClick={onClose} disabled={invite.isPending}>
            Close
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={invite.isPending} disabled={!email.trim()}>
            Send invitation
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim() && !invite.isPending) invite.mutate(email.trim());
        }}
      >
        {sent && !invite.isPending && !invite.isError ? (
          <Alert tone="success">
            Invitation sent to {sent.email}. The link works for {sent.expires_in_days}{" "}
            {sent.expires_in_days === 1 ? "day" : "days"}.
          </Alert>
        ) : null}
        {invite.error ? (
          <Alert tone="danger">{errorMessage(invite.error, "Failed to send the invitation")}</Alert>
        ) : null}
        <Field label="Email address" required>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={invite.isPending}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

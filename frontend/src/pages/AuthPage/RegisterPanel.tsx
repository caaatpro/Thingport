import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { authApi, type AuthResult } from "@/api/auth";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Spinner } from "@/ui";
import CheckEmailPanel from "./CheckEmailPanel";
import { checkNewPassword } from "./validation";

export type Invite = { token: string; email: string };

type Props = {
  onSuccess: (result: AuthResult) => void;
  invite?: Invite | null;
};

const INVITE_INVALID = "This invitation link is invalid or has expired. Ask whoever invited you for a new one.";

export default function RegisterPanel({ onSuccess, invite = null }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Set when the account needs email verification before it can sign in.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // The server says which address the invitation is for; until then, trust the link.
  const invitation = useQuery({
    queryKey: ["invitation", invite?.token],
    queryFn: () => authApi.getInvitation(invite!.token),
    enabled: invite !== null,
    retry: false,
    staleTime: Infinity,
  });
  const email = invite ? (invitation.data?.email ?? invite.email) : typedEmail;

  const register = useMutation({
    mutationFn: () => authApi.register({ displayName, email, password, inviteToken: invite?.token }),
    onSuccess: (result) => {
      if ("email_verification_required" in result) setPendingEmail(result.email);
      else onSuccess(result);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkNewPassword(password, confirm);
    setFormError(problem);
    if (!problem) register.mutate();
  };

  if (pendingEmail) return <CheckEmailPanel email={pendingEmail} />;
  if (invite && invitation.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-7" label="Checking your invitation" />
      </div>
    );
  }
  if (invite && invitation.isError)
    return <Alert tone="danger">{errorMessage(invitation.error, INVITE_INVALID)}</Alert>;

  const error = formError ?? (register.error ? errorMessage(register.error, "Registration failed") : null);
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {invite ? (
        <Alert tone="info">
          You’ve been invited to Thingport. Pick a display name and password to create your account.
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Display name">
        {(control) => (
          <Input
            {...control}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            required
          />
        )}
      </Field>
      <Field label="Email" hint={invite ? "Your invitation is for this address." : undefined}>
        {(control) => (
          <Input
            {...control}
            type="email"
            value={email}
            onChange={(event) => setTypedEmail(event.target.value)}
            autoComplete="email"
            disabled={invite !== null}
            required
          />
        )}
      </Field>
      <Field label="Password" hint="At least 8 characters">
        {(control) => (
          <Input
            {...control}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        )}
      </Field>
      <Field label="Confirm password">
        {(control) => (
          <Input
            {...control}
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={register.isPending}>
        {register.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

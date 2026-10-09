import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input } from "@/ui";

type Props = { initialEmail: string; onBack: () => void };

/** The backend replies the same whether or not the email has an account, so "sent" is all we can say. */
export default function ForgotPasswordPanel({ initialEmail, onBack }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const send = useMutation({ mutationFn: (address: string) => authApi.forgotPassword(address) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send.mutate(email.trim());
  };

  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-accent" strokeWidth={1.5} aria-hidden />
        <h2 className="text-lg font-semibold text-fg">Check your email</h2>
        <p className="text-sm text-muted">
          If an account uses <strong className="font-medium text-fg">{send.variables}</strong>, we’ve sent it a link to
          reset the password. The link expires in 1 hour.
        </p>
        <Button onClick={onBack}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Reset your password</h2>
        <p className="mt-1 text-sm text-muted">
          Enter your account’s email and we’ll send you a link to choose a new password.
        </p>
      </div>
      {send.error ? (
        <Alert tone="danger">{errorMessage(send.error, "Couldn’t send the email. Try again.")}</Alert>
      ) : null}
      <Field label="Email">
        {(control) => (
          <Input
            {...control}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={send.isPending}>
        {send.isPending ? "Sending…" : "Send reset link"}
      </Button>
      <Button variant="ghost" onClick={onBack} disabled={send.isPending}>
        Back to sign in
      </Button>
    </form>
  );
}

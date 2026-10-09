import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi, type AuthResult } from "@/api/auth";
import { EmailNotVerifiedError } from "@/api/client";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input } from "@/ui";
import ResendVerificationButton from "./ResendVerificationButton";

type Props = {
  onSuccess: (result: AuthResult) => void;
  /** Shown only when set, i.e. when the instance can send email. Receives whatever email was typed. */
  onForgotPassword?: (email: string) => void;
};

export default function SignInPanel({ onSuccess, onForgotPassword }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: (result) => onSuccess(result),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate();
  };

  const error = signIn.error;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{errorMessage(error, "Login failed")}</Alert> : null}
      {error instanceof EmailNotVerifiedError ? <ResendVerificationButton email={email} /> : null}
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
      <Field label="Password">
        {(control) => (
          <Input
            {...control}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        )}
      </Field>
      {onForgotPassword ? (
        <div className="-mt-2 flex justify-end">
          <Button variant="link" size="sm" onClick={() => onForgotPassword(email.trim())}>
            Forgot password?
          </Button>
        </div>
      ) : null}
      <Button type="submit" variant="primary" size="lg" loading={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Spinner } from "@/ui";
import { AuthShell } from "@/pages/AuthPage/AuthShell";
import { checkNewPassword } from "@/pages/AuthPage/validation";

const LINK_INVALID = "This password reset link is invalid or has expired. Ask for a new one.";

function BackToSignIn() {
  return (
    <Button variant="primary" asChild>
      <Link to="/" replace>
        Back to sign in
      </Link>
    </Button>
  );
}

/** `/reset-password?token=…`: choose a new password. Saving also signs in. */
export default function ResetPasswordPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // A dead link can't be retried, unlike a rejected password.
  const link = useQuery({
    queryKey: ["password-reset", token],
    queryFn: () => authApi.getPasswordReset(token!),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
  });

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token!, password),
    onSuccess: (result) => {
      login(result);
      navigate("/", { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkNewPassword(password, confirm);
    setFormError(problem);
    if (!problem) reset.mutate();
  };

  let body;
  if (!token || link.isError) {
    body = (
      <div className="flex flex-col items-center gap-4">
        <Alert tone="danger" className="w-full">
          {token ? errorMessage(link.error, LINK_INVALID) : "This password reset link is missing its token."}
        </Alert>
        <BackToSignIn />
      </div>
    );
  } else if (!link.data) {
    body = (
      <output className="flex flex-col items-center gap-3 py-2">
        <Spinner className="size-7" label="Checking your link" />
        <p className="text-sm text-muted">Checking your link…</p>
      </output>
    );
  } else {
    const error = formError ?? (reset.error ? errorMessage(reset.error, LINK_INVALID) : null);
    body = (
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-fg">Choose a new password</h2>
          <p className="mt-1 text-sm text-muted">For {link.data.email}. You’ll be signed in once it’s saved.</p>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" autoComplete="username" value={link.data.email} readOnly hidden />
        <Field label="New password" hint="At least 8 characters">
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
        <Field label="Confirm new password">
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
        <Button type="submit" variant="primary" size="lg" loading={reset.isPending}>
          {reset.isPending ? "Saving…" : "Save and sign in"}
        </Button>
      </form>
    );
  }

  return <AuthShell title="Reset password">{body}</AuthShell>;
}

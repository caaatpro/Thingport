import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Spinner } from "@/ui";
import { AuthShell } from "@/pages/AuthPage/AuthShell";

/** `/verify-email?token=…`: confirms the address, then signs in. */
export default function VerifyEmailPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  // The link is single-use, so it must be spent exactly once even when effects run twice in development.
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: (value: string) => authApi.verifyEmail(value),
    onSuccess: (result) => {
      login(result);
      navigate("/", { replace: true });
    },
  });
  const { mutate } = verify;

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    mutate(token);
  }, [token, mutate]);

  const error = !token
    ? "This verification link is missing its token."
    : verify.error
      ? errorMessage(verify.error, "This verification link is invalid or has expired.")
      : null;

  return (
    <AuthShell title="Confirm your email">
      {error ? (
        <div className="flex flex-col items-center gap-4">
          <Alert tone="danger" className="w-full">
            {error}
          </Alert>
          <Button variant="primary" asChild>
            <Link to="/" replace>
              Back to sign in
            </Link>
          </Button>
        </div>
      ) : (
        <output className="flex flex-col items-center gap-3 py-2">
          <Spinner className="size-7" label="Confirming your email" />
          <p className="text-sm text-muted">Confirming your email…</p>
        </output>
      )}
    </AuthShell>
  );
}

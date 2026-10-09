import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import type { AuthResult } from "@/api/auth";
import { useAuth } from "@/app/auth";
import { Alert, cn } from "@/ui";
import { AuthShell } from "./AuthShell";
import ForgotPasswordPanel from "./ForgotPasswordPanel";
import RegisterPanel, { type Invite } from "./RegisterPanel";
import SignInPanel from "./SignInPanel";

type TabValue = "signIn" | "register";

const tabClass = cn(
  "-mb-px flex-1 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-fg",
  "data-[state=active]:border-accent data-[state=active]:text-fg",
);

/** Sign in, register, forgot password and the invitation flow (`/register?invite=TOKEN&email=…`). */
export default function AuthPage() {
  const { health, login } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  const inviteToken = pathname === "/register" ? params.get("invite") : null;
  const invite: Invite | null = inviteToken ? { token: inviteToken, email: params.get("email") ?? "" } : null;

  const [tab, setTab] = useState<TabValue>(invite ? "register" : "signIn");
  // Set while the forgot-password form replaces the tabs; carries over the typed sign-in email.
  const [forgotEmail, setForgotEmail] = useState<string | null>(null);
  // Closed registrations hide the Register tab, unless this visit came from an invitation.
  const canRegister = (health?.allow_registrations ?? true) || invite !== null;
  const canReset = health?.password_reset_enabled ?? false;

  const onSuccess = (result: AuthResult) => {
    login(result);
    navigate("/", { replace: true });
  };

  const title = forgotEmail !== null ? "Reset password" : tab === "register" && canRegister ? "Create account" : "Sign in";
  return (
    <AuthShell title={title} subtitle="Sign in to continue">
      {health?.ok === false ? (
        <Alert tone="danger" className="mb-4">
          API appears offline. Ensure the API service is running.
        </Alert>
      ) : null}
      {forgotEmail !== null ? (
        <ForgotPasswordPanel initialEmail={forgotEmail} onBack={() => setForgotEmail(null)} />
      ) : (
        <Tabs.Root value={canRegister ? tab : "signIn"} onValueChange={(next) => setTab(next as TabValue)}>
          {canRegister ? (
            <Tabs.List aria-label="Account" className="mb-5 flex border-b border-border">
              <Tabs.Trigger value="signIn" className={tabClass}>
                Sign In
              </Tabs.Trigger>
              <Tabs.Trigger value="register" className={tabClass}>
                Register
              </Tabs.Trigger>
            </Tabs.List>
          ) : null}
          <Tabs.Content value="signIn" className="focus:outline-none">
            <SignInPanel onSuccess={onSuccess} onForgotPassword={canReset ? setForgotEmail : undefined} />
          </Tabs.Content>
          <Tabs.Content value="register" className="focus:outline-none">
            <RegisterPanel onSuccess={onSuccess} invite={invite} />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </AuthShell>
  );
}

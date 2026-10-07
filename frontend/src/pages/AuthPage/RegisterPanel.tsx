import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { authApi, type AuthUser } from "../../api/auth";
import CheckEmailPanel from "./CheckEmailPanel";

const MIN_PASSWORD_LENGTH = 8;

export type Invite = { token: string; email: string };

type Props = {
  onSuccess: (token: string, expires_in: number, user: AuthUser) => void;
  invite?: Invite | null;
};

export default function RegisterPanel({ onSuccess, invite = null }: Props) {
  const { t } = useTranslation("app");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState(invite?.email ?? "");
  // "valid" locks the email to the invited address; "invalid" keeps the form closed.
  const [inviteState, setInviteState] = React.useState<"checking" | "valid" | "invalid">(invite ? "checking" : "valid");
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Set when the account needs email verification.
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  // The token string, not the object, which App.tsx rebuilds every render.
  const inviteToken = invite?.token ?? null;
  React.useEffect(() => {
    if (!inviteToken) return;
    let active = true;
    authApi
      .getInvitation(inviteToken)
      .then((res) => {
        if (!active) return;
        setEmail(res.email);
        setInviteState("valid");
      })
      .catch((err) => {
        if (!active) return;
        setInviteError(err instanceof Error ? err.message : t("auth.register.inviteInvalid"));
        setInviteState("invalid");
      });
    return () => {
      active = false;
    };
  }, [inviteToken, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.register.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.register.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.register({
        displayName,
        email,
        password,
        inviteToken: invite?.token,
      });
      if ("email_verification_required" in res) {
        setPendingEmail(res.email);
      } else {
        // The one-time link shouldn't linger in the address bar or history.
        if (invite) window.history.replaceState(null, "", "/");
        onSuccess(res.token, res.expires_in, res.user);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("auth.register.failed"));
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return <CheckEmailPanel email={pendingEmail} />;
  }

  if (inviteState === "checking") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (inviteState === "invalid") {
    return <Alert severity="error">{inviteError ?? t("auth.register.inviteInvalid")}</Alert>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        {invite && <Alert severity="info">{t("auth.register.invited")}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t("auth.register.displayNameLabel")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          required
          fullWidth
          size="small"
        />
        <TextField
          type="email"
          label={t("auth.register.emailLabel")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          fullWidth
          size="small"
          disabled={invite !== null}
          helperText={invite ? t("auth.register.inviteEmailLocked") : undefined}
        />
        <Stack spacing={0.5}>
          <TextField
            type="password"
            label={t("auth.register.passwordLabel")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            size="small"
          />
          <Typography variant="caption" color="text.secondary">
            {t("auth.register.passwordHelp")}
          </Typography>
        </Stack>
        <TextField
          type="password"
          label={t("auth.register.confirmPasswordLabel")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          fullWidth
          size="small"
        />
        <Button type="submit" variant="contained" disabled={loading} fullWidth size="large">
          {loading ? t("auth.register.submitting") : t("auth.register.submit")}
        </Button>
      </Stack>
    </Box>
  );
}

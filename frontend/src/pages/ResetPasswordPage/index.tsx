import React from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Wordmark from "../../components/Wordmark";
import { authApi, type AuthUser } from "../../api/auth";

const MIN_PASSWORD_LENGTH = 8;

type Props = {
  onSuccess: (token: string, expires_in: number, user: AuthUser) => void;
};

const backToSignIn = () => {
  window.history.replaceState(null, "", "/");
  window.location.reload();
};

/** Rendered outside the router, so `token` is read from window.location. Saving signs in. */
export default function ResetPasswordPage({ onSuccess }: Props) {
  const { t } = useTranslation("app");
  const [token] = React.useState(() => new URLSearchParams(window.location.search).get("token"));
  const [accountEmail, setAccountEmail] = React.useState<string | null>(null);
  // A dead link can't be retried, unlike a rejected password.
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!token) {
      setLinkError(t("auth.resetPassword.missingToken"));
      return;
    }
    authApi.getPasswordReset(token).then(
      (res) => setAccountEmail(res.email),
      (err) => setLinkError(err instanceof Error ? err.message : t("auth.resetPassword.failed")),
    );
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.register.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.register.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.resetPassword(token, newPassword);
      window.history.replaceState(null, "", "/");
      onSuccess(res.token, res.expires_in, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.resetPassword.failed"));
      setLoading(false);
    }
  };

  let content: React.ReactNode;
  if (linkError) {
    content = (
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
        }}
      >
        <Alert severity="error" sx={{ width: "100%" }}>
          {linkError}
        </Alert>
        <Button variant="contained" onClick={backToSignIn}>
          {t("auth.resetPassword.backToSignIn")}
        </Button>
      </Stack>
    );
  } else if (!accountEmail) {
    content = (
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
        }}
      >
        <CircularProgress size={28} />
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {t("auth.resetPassword.checking")}
        </Typography>
      </Stack>
    );
  } else {
    content = (
      <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: "left" }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t("auth.resetPassword.heading")}</Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            {t("auth.resetPassword.forAccount", { email: accountEmail })}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {/* Lets password managers file the new password under the right account. */}
          <input type="email" autoComplete="username" value={accountEmail} readOnly hidden />
          <TextField
            type="password"
            label={t("auth.resetPassword.newPasswordLabel")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            helperText={t("auth.register.passwordHelp")}
            required
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("auth.resetPassword.confirmPasswordLabel")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            size="small"
          />
          <Button type="submit" variant="contained" disabled={loading} fullWidth size="large">
            {loading ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Paper
      elevation={8}
      sx={{
        width: "100%",
        maxWidth: 420,
        borderRadius: 3,
        p: 4,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack spacing={3} sx={{ textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Wordmark size="lg" />
        </Box>
        {content}
      </Stack>
    </Paper>
  );
}

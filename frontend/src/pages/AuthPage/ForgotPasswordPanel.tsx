import React from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import { authApi } from "../../api/auth";

type Props = {
  initialEmail: string;
  onBack: () => void;
};

/** The backend replies the same whether or not the email has an account, so "sent" is all we can say. */
export default function ForgotPasswordPanel({ initialEmail, onBack }: Props) {
  const { t } = useTranslation("app");
  const [email, setEmail] = React.useState(initialEmail);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.forgotPassword.failed"));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
          textAlign: "center",
          py: 1,
        }}
      >
        <MarkEmailReadIcon sx={{ fontSize: 40, color: "primary.main" }} />
        <Typography variant="h6">{t("auth.forgotPassword.sentHeading")}</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {t("auth.forgotPassword.sentBody", { email: sentTo })}
        </Typography>
        <Button variant="outlined" onClick={onBack}>
          {t("auth.forgotPassword.backToSignIn")}
        </Button>
      </Stack>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <Typography variant="h6">{t("auth.forgotPassword.heading")}</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {t("auth.forgotPassword.body")}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          type="email"
          label={t("auth.forgotPassword.emailLabel")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          fullWidth
          size="small"
        />
        <Button type="submit" variant="contained" disabled={loading} fullWidth size="large">
          {loading ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
        </Button>
        <Button onClick={onBack} disabled={loading}>
          {t("auth.forgotPassword.backToSignIn")}
        </Button>
      </Stack>
    </Box>
  );
}

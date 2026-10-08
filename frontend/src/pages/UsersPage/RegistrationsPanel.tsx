import React from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import { UnauthorizedError } from "../../api/client";
import { settingsApi } from "../../api/settings";
import InviteUsersDialog from "./InviteUsersDialog";

type Props = {
  onUnauthorized?: () => void;
};

/** Closed registrations still admit the first account and invitees. Inviting needs SMTP. */
export default function RegistrationsPanel({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const [allow, setAllow] = React.useState(true);
  const [smtpConfigured, setSmtpConfigured] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [registrations, smtp] = await Promise.all([settingsApi.getRegistrations(), settingsApi.getSmtp()]);
        if (!active) return;
        setAllow(registrations.allow_registrations);
        setSmtpConfigured(smtp.configured);
      } catch (err) {
        if (err instanceof UnauthorizedError) onUnauthorized?.();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [onUnauthorized]);

  const handleChange = async (next: boolean) => {
    const previous = allow;
    setAllow(next);
    setSaving(true);
    setError(null);
    try {
      const res = await settingsApi.updateRegistrations(next);
      setAllow(res.allow_registrations);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setAllow(previous);
      setError(err instanceof Error ? err.message : t("adminSettings.registrations.failed"));
    } finally {
      setSaving(false);
    }
  };

  const canInvite = !allow && smtpConfigured;

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            alignItems: { sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Stack spacing={0.5}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: "center",
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={allow}
                    disabled={loading || saving}
                    onChange={(e) => void handleChange(e.target.checked)}
                  />
                }
                label={t("adminSettings.registrations.allowLabel")}
              />
              {saving && <CircularProgress size={16} />}
            </Stack>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {allow ? t("adminSettings.registrations.openHelp") : t("adminSettings.registrations.closedHelp")}
            </Typography>
          </Stack>

          {canInvite && (
            <Stack
              spacing={0.5}
              sx={{
                alignItems: { xs: "flex-start", sm: "flex-end" },
                flexShrink: 0,
              }}
            >
              <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviteOpen(true)}>
                {t("adminSettings.registrations.inviteButton")}
              </Button>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                {t("adminSettings.registrations.inviteHelp")}
              </Typography>
            </Stack>
          )}
        </Stack>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Stack>
      <InviteUsersDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Paper>
  );
}

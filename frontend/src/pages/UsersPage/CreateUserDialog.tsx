import React from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { adminApi } from "../../api/admin";
import { UnauthorizedError } from "../../api/client";
import { copyText } from "../../utils/copyText";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onUnauthorized?: () => void;
};

type Created = { email: string; generatedPassword: string | null };

/** Creates the account directly -- the way to add people on an instance without outgoing email. */
export default function CreateUserDialog({ open, onClose, onCreated, onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"ADMIN" | "MEMBER">("MEMBER");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Created | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setEmail("");
    setName("");
    setRole("MEMBER");
    setPassword("");
    setError(null);
    setCreated(null);
    setCopied(false);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminApi.createUser({
        email: email.trim(),
        display_name: name.trim(),
        role,
        ...(password ? { password } : {}),
      });
      setCreated({ email: res.email, generatedPassword: res.generated_password });
      onCreated();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : t("adminSettings.users.create.failed"));
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    if (!created?.generatedPassword) return;
    setCopied(await copyText(created.generatedPassword));
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      {created ? (
        <>
          <DialogTitle>{t("adminSettings.users.create.doneTitle")}</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <DialogContentText>
                {created.generatedPassword
                  ? t("adminSettings.users.create.generatedHint", { email: created.email })
                  : t("adminSettings.users.create.noPasswordHint", { email: created.email })}
              </DialogContentText>
              {created.generatedPassword && (
                <Stack direction="row" spacing={1}>
                  <TextField
                    value={created.generatedPassword}
                    size="small"
                    fullWidth
                    InputProps={{ readOnly: true, sx: { fontFamily: "monospace" } }}
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={() => void copyPassword()}
                    sx={{ flexShrink: 0 }}
                  >
                    {copied ? t("adminSettings.users.create.copied") : t("adminSettings.users.create.copy")}
                  </Button>
                </Stack>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={onClose}>
              {t("adminSettings.users.create.close")}
            </Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogTitle>{t("adminSettings.users.create.title")}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <DialogContentText>{t("adminSettings.users.create.description")}</DialogContentText>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                type="email"
                label={t("adminSettings.users.create.emailLabel")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                size="small"
                fullWidth
                disabled={saving}
              />
              <TextField
                label={t("adminSettings.users.create.nameLabel")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                size="small"
                fullWidth
                disabled={saving}
              />
              <TextField
                select
                label={t("adminSettings.users.create.roleLabel")}
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}
                size="small"
                fullWidth
                disabled={saving}
              >
                <MenuItem value="MEMBER">{t("adminSettings.users.roleMember")}</MenuItem>
                <MenuItem value="ADMIN">{t("adminSettings.users.roleAdmin")}</MenuItem>
              </TextField>
              <TextField
                label={t("adminSettings.users.create.passwordLabel")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                size="small"
                fullWidth
                disabled={saving}
                autoComplete="off"
                error={password.length > 0 && password.length < 8}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={saving}>
              {t("common:cancel")}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || !email.trim() || !name.trim() || (password.length > 0 && password.length < 8)}
            >
              {saving ? t("adminSettings.users.create.creating") : t("adminSettings.users.create.submit")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}

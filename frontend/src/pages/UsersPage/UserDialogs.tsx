import React from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { adminApi, type AdminUser } from "../../api/admin";
import { UnauthorizedError } from "../../api/client";
import { copyText } from "../../utils/copyText";
import { formatFileSize } from "../../utils/fileSize";

/** Shared by the dialogs: runs `action`, reports its error inline, and hands a 401 to the app. */
function useAction(onUnauthorized?: () => void) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

type BaseProps = {
  user: AdminUser | null;
  onClose: () => void;
  onChanged: (message?: string) => void;
  onUnauthorized?: () => void;
};

export function EditUserDialog({ user, onClose, onChanged, onUnauthorized }: BaseProps) {
  const { t } = useTranslation(["app", "common"]);
  const [name, setName] = React.useState("");
  const { busy, error, setError, run } = useAction(onUnauthorized);

  React.useEffect(() => {
    setName(user?.display_name ?? "");
    setError(null);
    // setError is stable; only a different user should reset the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    void run(async () => {
      await adminApi.updateUser(user.id, { display_name: name.trim() });
      onChanged(t("adminSettings.users.saved"));
      onClose();
    });
  };

  return (
    <Dialog open={Boolean(user)} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>{t("adminSettings.users.edit.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t("adminSettings.users.edit.nameLabel")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              size="small"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t("common:cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={busy || !name.trim()}>
            {t("adminSettings.users.edit.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function ResetLinkDialog({ user, onClose, onUnauthorized }: Omit<BaseProps, "onChanged">) {
  const { t, i18n } = useTranslation(["app", "common"]);
  const [link, setLink] = React.useState<{ url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { busy, error, run } = useAction(onUnauthorized);

  React.useEffect(() => {
    setLink(null);
    setCopied(false);
    if (!user) return;
    void run(async () => setLink(await adminApi.createResetLink(user.id)));
    // a new link only for a newly opened dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <Dialog open={Boolean(user)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("adminSettings.users.reset.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <DialogContentText>
            {t("adminSettings.users.reset.description", { name: user?.display_name ?? "" })}
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
          {busy && !link && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <span>{t("adminSettings.users.reset.creating")}</span>
            </Stack>
          )}
          {link && (
            <>
              <Stack direction="row" spacing={1}>
                <TextField
                  value={link.url}
                  size="small"
                  fullWidth
                  InputProps={{ readOnly: true, sx: { fontFamily: "monospace", fontSize: 12 } }}
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  onClick={async () => setCopied(await copyText(link.url))}
                  sx={{ flexShrink: 0 }}
                >
                  {copied ? t("adminSettings.users.reset.copied") : t("adminSettings.users.reset.copy")}
                </Button>
              </Stack>
              <DialogContentText variant="caption">
                {t("adminSettings.users.reset.expires", {
                  time: new Date(link.expires_at).toLocaleTimeString(i18n.language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </DialogContentText>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common:close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export function SignOutDialog({ user, onClose, onChanged, onUnauthorized }: BaseProps) {
  const { t } = useTranslation(["app", "common"]);
  const [revoke, setRevoke] = React.useState(false);
  const { busy, error, setError, run } = useAction(onUnauthorized);

  React.useEffect(() => {
    setRevoke(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const confirm = () => {
    if (!user) return;
    void run(async () => {
      const res = await adminApi.signOutUser(user.id, revoke);
      onChanged(
        res.revoked_tokens > 0
          ? t("adminSettings.users.signOut.doneTokens", { name: user.display_name, count: res.revoked_tokens })
          : t("adminSettings.users.signOut.done", { name: user.display_name }),
      );
      onClose();
    });
  };

  return (
    <Dialog open={Boolean(user)} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("adminSettings.users.signOut.title", { name: user?.display_name ?? "" })}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <DialogContentText>{t("adminSettings.users.signOut.message")}</DialogContentText>
          {user && user.api_token_count > 0 && (
            <FormControlLabel
              control={<Checkbox checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />}
              label={t("adminSettings.users.signOut.revokeTokens", { count: user.api_token_count })}
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("common:cancel")}
        </Button>
        <Button variant="contained" onClick={confirm} disabled={busy}>
          {t("adminSettings.users.signOut.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Deleting an account is permanent, so the admin types its email to confirm. */
export function DeleteUserDialog({ user, onClose, onChanged, onUnauthorized }: BaseProps) {
  const { t } = useTranslation(["app", "common"]);
  const [typed, setTyped] = React.useState("");
  const { busy, error, setError, run } = useAction(onUnauthorized);

  React.useEffect(() => {
    setTyped("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const matches = Boolean(user) && typed.trim().toLowerCase() === user!.email.toLowerCase();

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !matches) return;
    void run(async () => {
      await adminApi.deleteUser(user.id);
      onChanged(t("adminSettings.users.deleteUser.done", { name: user.display_name }));
      onClose();
    });
  };

  return (
    <Dialog open={Boolean(user)} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={confirm}>
        <DialogTitle>{t("adminSettings.users.deleteUser.title", { name: user?.display_name ?? "" })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              {user
                ? t("adminSettings.users.deleteUser.message", {
                    models: user.print_count,
                    size: formatFileSize(user.storage_bytes) || "0 B",
                  })
                : ""}
            </DialogContentText>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t("adminSettings.users.deleteUser.typeToConfirm", { email: user?.email ?? "" })}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              size="small"
              fullWidth
              autoComplete="off"
              disabled={busy}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t("common:cancel")}
          </Button>
          <Button type="submit" variant="contained" color="error" disabled={busy || !matches}>
            {t("adminSettings.users.deleteUser.confirm")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

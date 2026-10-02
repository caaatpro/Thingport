import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import { usersApi } from "../api/users";
import type { DirectoryUser, ShareUser } from "../api/prints";
import { UnauthorizedError } from "../api/client";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Resource name, shown in the title. */
  name: string;
  loadShares: () => Promise<ShareUser[]>;
  saveShares: (userIds: string[]) => Promise<void>;
  onSaved?: () => void;
  onUnauthorized?: () => void;
};

/** Targeted-sharing picker: toggle which members can see a model or collection. */
export default function ShareDialog({ open, onClose, name, loadShares, saveShares, onSaved, onUnauthorized }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFilter("");
    Promise.all([usersApi.list(), loadShares()])
      .then(([all, shares]) => {
        if (cancelled) return;
        setUsers(all);
        setSelected(new Set(shares.map((s) => s.user_id)));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) return onUnauthorized?.();
        setError(err instanceof Error ? err.message : t("models:share.loadFailed"));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (users ?? []).filter(
      (u) => !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, filter]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveShares([...selected]);
      onSaved?.();
      onClose();
    } catch (err) {
      if (err instanceof UnauthorizedError) return onUnauthorized?.();
      setError(err instanceof Error ? err.message : t("models:share.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("models:share.title", { name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {selected.size > 0
              ? t("models:share.summaryShared", { count: selected.size })
              : t("models:share.summaryPrivate")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : users && users.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              {t("models:share.empty")}
            </Typography>
          ) : (
            <>
              <TextField
                size="small"
                fullWidth
                placeholder={t("models:share.searchPlaceholder") ?? ""}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <List dense sx={{ maxHeight: 280, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                {filtered.map((u) => (
                  <ListItemButton key={u.id} onClick={() => toggle(u.id)} dense>
                    <Checkbox edge="start" size="small" checked={selected.has(u.id)} tabIndex={-1} disableRipple />
                    <ListItemText primary={u.display_name} secondary={u.email} />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("common:cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {t("common:save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import { UnauthorizedError } from "../../api/client";
import { type ApiToken, type CreatedApiToken, tokensApi } from "../../api/tokens";
import { useConfirm } from "../../components/ConfirmProvider";

type Props = { onUnauthorized?: () => void };

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);

const EXPIRY_OPTIONS = [
  { value: 0, key: "never" },
  { value: 30, key: "days30" },
  { value: 90, key: "days90" },
  { value: 365, key: "year1" },
] as const;

/** Create and revoke the tokens that tools such as the Thingport Grab extension sign in with, so they
 *  never need the account password. The secret is shown once, right after creation. */
export default function ApiTokensSection({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const confirmDialog = useConfirm();
  const [tokens, setTokens] = React.useState<ApiToken[] | null>(null);
  const [loadedAt, setLoadedAt] = React.useState(0);
  const [name, setName] = React.useState("");
  const [expiry, setExpiry] = React.useState<number>(0);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = React.useState(false);
  const secretRef = React.useRef<HTMLInputElement | null>(null);

  const fail = React.useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error && err.message ? err.message : fallback);
    },
    [onUnauthorized],
  );

  const reload = React.useCallback(async () => {
    try {
      const list = await tokensApi.list();
      setTokens(list);
      setLoadedAt(Date.now());
    } catch (err) {
      fail(err, t("app:profile.apiTokens.loadFailed"));
    }
  }, [fail, t]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setCopied(false);
    try {
      const created = await tokensApi.create(name.trim(), expiry || null);
      setFresh(created);
      setName("");
      await reload();
    } catch (err) {
      fail(err, t("app:profile.apiTokens.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: ApiToken) => {
    const ok = await confirmDialog({
      message: t("app:profile.apiTokens.confirmRevoke", { name: token.name }),
      confirmLabel: t("app:profile.apiTokens.revoke"),
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await tokensApi.revoke(token.id);
      if (fresh?.id === token.id) setFresh(null);
      await reload();
    } catch (err) {
      fail(err, t("app:profile.apiTokens.revokeFailed"));
    }
  };

  const copySecret = async () => {
    const input = secretRef.current;
    if (!fresh || !input) return;
    try {
      // navigator.clipboard only exists on HTTPS or localhost; fall back to selecting the text.
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(fresh.token);
      else {
        input.select();
        document.execCommand("copy");
      }
      setCopied(true);
    } catch {
      input.select();
    }
  };

  return (
    <Stack spacing={2} id="api-tokens">
      <Box>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            color: (muiTheme) => muiTheme.thingport.headingText,
          }}
        >
          {t("app:profile.apiTokens.title")}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {t("app:profile.apiTokens.description")}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {fresh && (
        <Alert severity="success" onClose={() => setFresh(null)}>
          <Stack spacing={1}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
              }}
            >
              {t("app:profile.apiTokens.created", { name: fresh.name })}
            </Typography>
            <Typography variant="body2">{t("app:profile.apiTokens.copyNow")}</Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
              }}
            >
              <TextField
                size="small"
                fullWidth
                value={fresh.token}
                inputRef={secretRef}
                onFocus={(e) => e.target.select()}
                slotProps={{ input: { readOnly: true, sx: { fontFamily: "monospace", fontSize: 13 } } }}
              />
              <Button variant="outlined" size="small" onClick={copySecret} sx={{ flexShrink: 0 }}>
                {copied ? t("app:profile.apiTokens.copied") : t("app:profile.apiTokens.copy")}
              </Button>
            </Stack>
          </Stack>
        </Alert>
      )}

      {tokens === null ? (
        <CircularProgress size={20} />
      ) : tokens.length === 0 ? (
        <Typography
          variant="body2"
          sx={{
            color: "text.disabled",
          }}
        >
          {t("app:profile.apiTokens.none")}
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />} spacing={0}>
          {tokens.map((token) => {
            const expired = token.expires_at ? new Date(token.expires_at).getTime() <= loadedAt : false;
            return (
              <Stack
                key={token.id}
                direction="row"
                spacing={1.5}
                sx={{
                  alignItems: "center",
                  py: 1,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        fontWeight: 600,
                      }}
                    >
                      {token.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontFamily: "monospace",
                      }}
                    >
                      {token.prefix}…
                    </Typography>
                    {expired && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={t("app:profile.apiTokens.expired")}
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      display: "block",
                    }}
                  >
                    {[
                      t("app:profile.apiTokens.createdAt", { date: formatDate(token.created_at) }),
                      token.last_used_at
                        ? t("app:profile.apiTokens.lastUsed", { date: formatDate(token.last_used_at) })
                        : t("app:profile.apiTokens.neverUsed"),
                      token.expires_at
                        ? t("app:profile.apiTokens.expiresAt", { date: formatDate(token.expires_at) })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Box>
                <Button size="small" color="error" onClick={() => void handleRevoke(token)}>
                  {t("app:profile.apiTokens.revoke")}
                </Button>
              </Stack>
            );
          })}
        </Stack>
      )}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          alignItems: { sm: "flex-start" },
        }}
      >
        <TextField
          size="small"
          label={t("app:profile.apiTokens.nameLabel")}
          placeholder={t("app:profile.apiTokens.namePlaceholder") ?? ""}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
          sx={{ flex: 1 }}
          slotProps={{
            htmlInput: { maxLength: 60 },
          }}
        />
        <TextField
          select
          size="small"
          label={t("app:profile.apiTokens.expiryLabel")}
          value={expiry}
          onChange={(e) => setExpiry(Number(e.target.value))}
          disabled={creating}
          sx={{ minWidth: 150 }}
        >
          {EXPIRY_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {t(`app:profile.apiTokens.expiry.${o.key}`)}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={handleCreate} disabled={creating || !name.trim()}>
          {t("app:profile.apiTokens.create")}
        </Button>
      </Stack>
    </Stack>
  );
}

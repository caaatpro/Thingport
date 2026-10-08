import React from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { UnauthorizedError } from "../../api/client";
import { adminApi, type AuthorLinkingStatus } from "../../api/admin";

type Props = {
  onUnauthorized?: () => void;
};

const POLL_MS = 2000;

/** Links name-only models to authors across the instance, looking authors up on their site where
 *  needed. Shown only while there's something to link or report. */
export default function LinkAuthorsSection({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const [status, setStatus] = React.useState<AuthorLinkingStatus | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const running = Boolean(status?.run?.running);

  const refresh = React.useCallback(async () => {
    try {
      setStatus(await adminApi.getAuthorLinking());
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
    }
  }, [onUnauthorized]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { run } = await adminApi.startAuthorLinking();
      setStatus((prev) => (prev ? { ...prev, run } : prev));
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(err instanceof Error ? err.message : t("adminSettings.triggers.linkAuthorsFailed"));
    } finally {
      setStarting(false);
    }
  };

  if (!status) return null;
  const { linkable, lookup, run } = status;
  if (!linkable && !lookup && !run) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
            }}
          >
            {t("adminSettings.triggers.linkAuthorsTitle")}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            {t("adminSettings.triggers.linkAuthorsDesc")}
          </Typography>
        </Box>

        {run?.running ? (
          <Stack spacing={1}>
            <Typography variant="body2">
              {t("adminSettings.triggers.linkAuthorsProgress", {
                done: run.lookedUp,
                total: run.toLookUp,
                linked: run.linked,
              })}
            </Typography>
            <LinearProgress
              variant={run.toLookUp ? "determinate" : "indeterminate"}
              value={run.toLookUp ? (run.lookedUp / run.toLookUp) * 100 : undefined}
            />
          </Stack>
        ) : (
          (linkable > 0 || lookup > 0) && (
            <Stack
              direction="row"
              spacing={1.5}
              useFlexGap
              sx={{
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Button variant="contained" onClick={() => void start()} disabled={starting}>
                {t("adminSettings.triggers.linkAuthorsButton")}
              </Button>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                }}
              >
                {[
                  linkable > 0 ? t("adminSettings.triggers.linkAuthorsLinkable", { count: linkable }) : null,
                  lookup > 0 ? t("adminSettings.triggers.linkAuthorsLookup", { count: lookup }) : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </Typography>
            </Stack>
          )
        )}

        {run && !run.running && (
          <Alert severity={run.linked > 0 ? "success" : "info"}>
            {t("adminSettings.triggers.linkAuthorsDone", { linked: run.linked })}
            {run.notFound > 0 && ` ${t("adminSettings.triggers.linkAuthorsNotFound", { count: run.notFound })}`}
          </Alert>
        )}
        {run?.problems.map((problem) => (
          <Alert key={problem} severity="warning">
            {t(`adminSettings.triggers.linkAuthorsProblems.${problem}`)}
          </Alert>
        ))}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

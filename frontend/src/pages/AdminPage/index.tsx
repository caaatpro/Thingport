import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import HistoryIcon from "@mui/icons-material/History";
import BoltIcon from "@mui/icons-material/Bolt";
import CableIcon from "@mui/icons-material/Cable";
import PublicIcon from "@mui/icons-material/Public";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import SyncIcon from "@mui/icons-material/Sync";
import UpdateCheckSection from "./UpdateCheckSection";
import { adminApi, type AdminOverview } from "../../api/admin";
import { UnauthorizedError } from "../../api/client";
import { useToast } from "../../components/ToastProvider";
import { formatFileSize } from "../../utils/fileSize";
import { THINGPORT_WEBSITE_URL } from "../../constants/website";

type Section = {
  path: string;
  icon: React.ReactNode;
  labelKey: string;
  descriptionKey: string;
};

const SECTIONS: Section[] = [
  { path: "/admin-users", icon: <PeopleIcon />, labelKey: "adminSettings.users.heading", descriptionKey: "users" },
  { path: "/admin-settings", icon: <SettingsIcon />, labelKey: "common:settings", descriptionKey: "settings" },
  {
    path: "/admin-rendering",
    icon: <ViewInArIcon />,
    labelKey: "adminSettings.rendering.heading",
    descriptionKey: "rendering",
  },
  { path: "/admin-logs", icon: <HistoryIcon />, labelKey: "adminSettings.logs.heading", descriptionKey: "logs" },
  {
    path: "/admin-triggers",
    icon: <BoltIcon />,
    labelKey: "adminSettings.triggers.heading",
    descriptionKey: "triggers",
  },
  {
    path: "/admin-connections",
    icon: <CableIcon />,
    labelKey: "adminSettings.connections.heading",
    descriptionKey: "connections",
  },
];

type Props = {
  onUnauthorized?: () => void;
};

const cardBorder = (theme: { palette: { mode: string } }) =>
  theme.palette.mode === "dark" ? "transparent" : "divider";

function StatCard({
  title,
  value,
  lines,
  action,
  href,
  tone,
}: {
  title: string;
  value: React.ReactNode;
  lines: string[];
  action?: React.ReactNode;
  /** Makes the whole card a link. */
  href?: string;
  tone?: "warning";
}) {
  const navigate = useNavigate();
  return (
    <Paper
      variant="outlined"
      {...(href
        ? {
            component: "a",
            href,
            onClick: (event: React.MouseEvent) => {
              event.preventDefault();
              navigate(href);
            },
          }
        : {})}
      sx={{
        p: 2.5,
        flex: 1,
        minWidth: 0,
        borderRadius: "12px",
        color: "inherit",
        textDecoration: "none",
        borderColor: (theme) => (tone === "warning" ? theme.palette.warning.main : cardBorder(theme)),
        transition: "box-shadow .15s ease, transform .15s ease",
        ...(href
          ? { "&:hover, &:focus-visible": { boxShadow: 4, transform: "translateY(-1px)", outline: "none" } }
          : {}),
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}
      >
        {title}
      </Typography>
      <Typography
        variant="h5"
        fontWeight={700}
        sx={{ mt: 0.5, mb: 0.75, color: (theme) => theme.thingport.headingText }}
      >
        {value}
      </Typography>
      <Stack spacing={0.25}>
        {lines.map((line) => (
          <Typography key={line} variant="body2" color="text.secondary">
            {line}
          </Typography>
        ))}
      </Stack>
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Paper>
  );
}

export default function AdminPage({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const navigate = useNavigate();
  const showToast = useToast();
  // undefined = loading, null = failed (the cards hide).
  const [overview, setOverview] = useState<AdminOverview | null | undefined>(undefined);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await adminApi.getOverview());
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      setOverview(null);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const res = await adminApi.retryFailedProcessing();
      showToast({ message: t("adminSettings.overview.retried", { count: res.retried }) });
      await load();
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else showToast({ message: err instanceof Error ? err.message : String(err), severity: "error" });
    } finally {
      setRetrying(false);
    }
  };

  const busyCount = overview ? overview.processing.queued + overview.processing.processing : 0;
  const failedCount = overview?.processing.failed ?? 0;

  return (
    <Stack spacing={3} sx={{ maxWidth: 960 }}>
      {overview === undefined && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={132} sx={{ flex: 1, borderRadius: "12px" }} />
          ))}
        </Stack>
      )}
      {overview && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <StatCard
            title={t("adminSettings.overview.users")}
            value={overview.users.total}
            href="/admin-users"
            lines={[
              t("adminSettings.overview.usersDetail", { active: overview.users.active_7d }),
              ...(overview.users.disabled > 0
                ? [t("adminSettings.overview.disabledCount", { count: overview.users.disabled })]
                : []),
              ...(overview.users.pending_invitations > 0
                ? [t("adminSettings.overview.invitations", { count: overview.users.pending_invitations })]
                : []),
            ]}
          />
          <StatCard
            title={t("adminSettings.overview.library")}
            value={formatFileSize(overview.library.model_bytes) || "0 B"}
            lines={[
              t("adminSettings.overview.models", { count: overview.library.models }),
              t("adminSettings.overview.collections", { count: overview.library.collections }),
            ]}
          />
          <StatCard
            title={t("adminSettings.overview.background")}
            value={busyCount + failedCount === 0 ? "✓" : busyCount}
            tone={failedCount > 0 ? "warning" : undefined}
            lines={[
              busyCount + failedCount === 0 && overview.imports.running === 0
                ? t("adminSettings.overview.allClear")
                : "",
              busyCount > 0 ? t("adminSettings.overview.queued", { count: busyCount }) : "",
              failedCount > 0 ? t("adminSettings.overview.failed", { count: failedCount }) : "",
              overview.imports.running > 0
                ? t("adminSettings.overview.importsRunning", { count: overview.imports.running })
                : "",
              overview.imports.failed_24h > 0
                ? t("adminSettings.overview.importsFailed", { count: overview.imports.failed_24h })
                : "",
            ].filter(Boolean)}
            action={
              failedCount > 0 ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SyncIcon fontSize="small" />}
                  disabled={retrying}
                  onClick={() => void retryFailed()}
                >
                  {t("adminSettings.overview.retry")}
                </Button>
              ) : undefined
            }
          />
        </Stack>
      )}

      <UpdateCheckSection onUnauthorized={onUnauthorized} />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
        {SECTIONS.map((section) => (
          <Paper
            key={section.path}
            variant="outlined"
            component="a"
            href={section.path}
            onClick={(event: React.MouseEvent) => {
              event.preventDefault();
              navigate(section.path);
            }}
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              gap: 2,
              color: "inherit",
              textDecoration: "none",
              borderRadius: "12px",
              borderColor: cardBorder,
              transition: "box-shadow .15s ease, transform .15s ease",
              "&:hover, &:focus-visible": { boxShadow: 4, transform: "translateY(-1px)", outline: "none" },
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "primary.main",
                bgcolor: (theme) => theme.palette.action.hover,
              }}
            >
              {section.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700} sx={{ color: (theme) => theme.thingport.headingText }}>
                {t(section.labelKey)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t(`adminSettings.overview.descriptions.${section.descriptionKey}`)}
              </Typography>
            </Box>
            <ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />
          </Paper>
        ))}
      </Box>

      <Stack
        direction="row"
        spacing={3}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ px: 0.5, color: "text.secondary" }}
      >
        <Stack direction="row" alignItems="center" spacing={1} title={t("adminSettings.website.hint")}>
          <PublicIcon fontSize="small" />
          <Link href={THINGPORT_WEBSITE_URL} target="_blank" rel="noopener" variant="body2" underline="hover">
            {t("adminSettings.website.link")}
          </Link>
        </Stack>
      </Stack>
    </Stack>
  );
}

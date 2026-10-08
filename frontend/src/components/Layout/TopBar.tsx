import React, { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { alpha } from "@mui/material/styles";
import type { AuthUser } from "../../api/auth";
import type { ThemeSelection } from "../../constants/settingsOptions";
import AddMenu from "./AddMenu";
import NotificationBell from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import GlobalSearch from "./GlobalSearch";

type Props = {
  title: string;
  /** The entity kind, shown under the title so a long name gets the full line. */
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  categoryId: string | null;
  makerworldCookie: string;
  onUploaded: () => void;
  onUnauthorized?: () => void;
  user: AuthUser | null;
  theme: ThemeSelection;
  onThemeChange: (theme: ThemeSelection) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
};

/** A grid with equal `1fr` side columns keeps the search box centered however wide the sides are. */
export default function TopBar({
  title,
  subtitle,
  onBack,
  actions,
  categoryId,
  makerworldCookie,
  onUploaded,
  onUnauthorized,
  user,
  theme,
  onThemeChange,
  onOpenProfile,
  onLogout,
}: Props) {
  const { t } = useTranslation("app");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Publishes the bar's real height (it can wrap) as a CSS var for sticky elements below it.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--topbar-height", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 520px) minmax(0, 1fr)",
        alignItems: "center",
        gap: 2,
        height: 64,
        px: { xs: 2, md: 4 },
        // Content scrolls underneath; the blur keeps the bar readable without a hard edge.
        position: "sticky",
        top: 0,
        zIndex: (muiTheme) => muiTheme.zIndex.appBar,
        bgcolor: (muiTheme) => alpha(muiTheme.thingport.pageBackground, 0.82),
        backdropFilter: "saturate(1.4) blur(14px)",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      {/* minWidth: 0 overrides the grid item default of `min-width: auto` -- without it, this
          column refuses to shrink below its content's natural width (the title, mainly), which
          would push the center/right columns off `justify-content` center/right well before the
          window actually runs out of room. */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          minWidth: 0,
        }}
      >
        {onBack && (
          <Tooltip title={t("shell.backToLibrary")}>
            <IconButton
              size="small"
              onClick={onBack}
              aria-label={t("shell.backToLibrary") ?? undefined}
              sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h1" noWrap sx={{ color: (muiTheme) => muiTheme.thingport.headingText }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" noWrap sx={{ display: "block", mt: "-2px", color: "text.secondary" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions}
      </Stack>
      <Box sx={{ minWidth: 0, justifySelf: "center", width: "100%" }}>
        <GlobalSearch onUnauthorized={onUnauthorized} />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          minWidth: 0,
          justifySelf: "end",
        }}
      >
        <AddMenu
          categoryId={categoryId}
          makerworldCookie={makerworldCookie}
          onUploaded={onUploaded}
          onUnauthorized={onUnauthorized}
        />
        <NotificationBell />
        <UserMenu
          user={user}
          theme={theme}
          onThemeChange={onThemeChange}
          onOpenProfile={onOpenProfile}
          onLogout={onLogout}
        />
      </Stack>
    </Box>
  );
}

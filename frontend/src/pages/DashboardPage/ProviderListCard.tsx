import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Chip from "@mui/material/Chip";
import PublicIcon from "@mui/icons-material/Public";
import { printProviderInfo } from "../../constants/importProviders";
import type { DashboardProvider } from "../../api/dashboard";

type Props = {
  providers: DashboardProvider[];
};

/** A small fixed set, so no "see more" and no clickable rows. */
export default function ProviderListCard({ providers }: Props) {
  const { t } = useTranslation("app");

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        borderColor: (theme) => (theme.palette.mode === "dark" ? "transparent" : "divider"),
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, color: "primary.main" }}>
        <PublicIcon />
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: (theme) => theme.thingport.headingText,
          }}
        >
          {t("dashboard.topProviders.title")}
        </Typography>
      </Box>

      {providers.length === 0 ? (
        <Typography
          sx={{
            color: "text.secondary",
            py: 2,
          }}
        >
          {t("dashboard.topProviders.empty")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {providers.map((p) => {
            const info = printProviderInfo(p.provider);
            return (
              <ListItem key={p.provider} sx={{ px: 1 }}>
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <Chip
                    label={info.label}
                    size="small"
                    sx={{ bgcolor: info.color, color: info.textColor ?? "#fff", fontWeight: 600 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      flexShrink: 0,
                      pl: 1,
                    }}
                  >
                    {t("dashboard.topProviders.modelCount", { count: p.model_count })}
                  </Typography>
                </Stack>
              </ListItem>
            );
          })}
        </List>
      )}
    </Paper>
  );
}

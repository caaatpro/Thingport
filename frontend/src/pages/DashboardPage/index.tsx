import React from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import CollectionsIcon from "@mui/icons-material/Collections";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import PersonIcon from "@mui/icons-material/Person";
import HistoryIcon from "@mui/icons-material/History";
import NewReleasesIcon from "@mui/icons-material/NewReleases";
import StarIcon from "@mui/icons-material/Star";
import FolderIcon from "@mui/icons-material/Folder";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import { UnauthorizedError } from "../../api/client";
import { dashboardApi, type DashboardSummary } from "../../api/dashboard";
import CountCard from "./CountCard";
import ModelListCard from "./ModelListCard";
import AuthorListCard from "./AuthorListCard";
import ProviderListCard from "./ProviderListCard";
import Shelf from "./Shelf";
import { relativeTime } from "./relativeTime";

type Props = {
  onUnauthorized?: () => void;
};

export default function DashboardPage({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await dashboardApi.getSummary();
        if (active) setSummary(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof UnauthorizedError) onUnauthorized?.();
        else setError(t("dashboard.loadError"));
      }
    })();
    return () => {
      active = false;
    };
  }, [onUnauthorized, t]);

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 3 }}>
        {error}
      </Alert>
    );
  }

  if (!summary) {
    return (
      <Stack
        sx={{
          alignItems: "center",
          justifyContent: "center",
          py: 10,
        }}
      >
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Stack spacing={4}>
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 2 }}
        aria-label={t("dashboard.statsLabel")}
      >
        <CountCard
          icon={<ViewInArIcon />}
          count={summary.model_count}
          label={t("dashboard.modelCount.label")}
          to="/models"
        />
        <CountCard
          icon={<CollectionsIcon />}
          count={summary.collection_count}
          label={t("dashboard.collectionCount.label")}
          to="/models/collections"
        />
        <CountCard icon={<PersonIcon />} count={summary.author_count} label={t("dashboard.authorCount.label")} />
        <CountCard
          icon={<FolderIcon />}
          count={summary.category_count}
          label={t("dashboard.categoryCount.label")}
          to="/models"
        />
      </Box>

      <Shelf icon={<HistoryIcon />} title={t("dashboard.recentlyViewed.title")} models={summary.recently_viewed} />
      <Shelf
        icon={<NewReleasesIcon />}
        title={t("dashboard.recentlyAdded.title")}
        models={summary.recently_added}
        emptyText={t("dashboard.recentlyAdded.empty")}
        caption={(model) => relativeTime(model.created_at, t)}
      />
      <Shelf icon={<StarIcon />} title={t("dashboard.favorites.title")} models={summary.favorites} />

      <Box
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" }, gap: 2, alignItems: "start" }}
      >
        <ModelListCard
          icon={<VisibilityIcon />}
          title={t("dashboard.topViewed.title")}
          models={summary.top_viewed}
          valueOf={(m) => m.view_count}
          valueLabel={(count) => t("dashboard.viewCount", { count })}
          emptyText={t("dashboard.topViewed.empty")}
          seeMoreLabel={t("dashboard.seeMore")}
          fetchMore={dashboardApi.getTopViewed}
        />
        <ModelListCard
          icon={<PrintIcon />}
          title={t("dashboard.topPrinted.title")}
          models={summary.top_printed}
          valueOf={(m) => m.print_count}
          valueLabel={(count) => t("dashboard.printCount", { count })}
          emptyText={t("dashboard.topPrinted.empty")}
          seeMoreLabel={t("dashboard.seeMore")}
          fetchMore={dashboardApi.getTopPrinted}
        />
        <Stack spacing={2}>
          <AuthorListCard authors={summary.top_authors} />
          <ProviderListCard providers={summary.top_providers} />
        </Stack>
      </Box>
    </Stack>
  );
}

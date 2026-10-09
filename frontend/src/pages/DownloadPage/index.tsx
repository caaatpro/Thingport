import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import DownloadIcon from "@mui/icons-material/Download";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { EXTENSION_ZIP_URL } from "../../constants/extension";
import extensionIcon from "../../assets/logos/thingport-icon-color.svg";
// Official Chrome logo (github.com/alrra/browser-logos), shown to mark which browser the extension is for.
import chromeLogo from "../../assets/logos/browsers/chrome.svg";

export default function DownloadPage() {
  const { t } = useTranslation(["app", "common"]);
  usePageHeader({ title: t("sidebar.downloads") });

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: (muiTheme) => muiTheme.thingport.headingText,
          }}
        >
          {t("download.pageTitle")}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {t("download.intro")}
        </Typography>
      </Box>

      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: "flex-start",
          }}
        >
          <Box component="img" src={extensionIcon} alt="" sx={{ width: 24, height: 24, mt: 0.5 }} />
          <Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
              }}
            >
              {t("download.extension.heading")}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {t("download.extension.intro")}
            </Typography>
          </Box>
        </Stack>
        <Paper variant="outlined" sx={{ p: 2.5, maxWidth: 520 }}>
          <Stack
            spacing={1.5}
            sx={{
              alignItems: "flex-start",
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
              }}
            >
              <Box component="img" src={extensionIcon} alt="" sx={{ width: 40, height: 40 }} />
              <Box component="img" src={chromeLogo} alt="Chrome" sx={{ width: 32, height: 32 }} />
            </Stack>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
              }}
            >
              {t("download.extension.name")} (Chrome)
            </Typography>
            <Button
              component="a"
              href={EXTENSION_ZIP_URL}
              download
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon fontSize="small" />}
            >
              {t("download.extension.download")}
            </Button>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              {t("download.extension.install")}
            </Typography>
          </Stack>
        </Paper>
      </Stack>

      <Divider />
    </Stack>
  );
}

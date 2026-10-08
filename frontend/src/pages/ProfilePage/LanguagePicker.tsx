import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ButtonBase from "@mui/material/ButtonBase";
import CheckIcon from "@mui/icons-material/Check";
import { SUPPORTED_LANGUAGES } from "../../constants/languages";

/** Applies immediately on click. */
export default function LanguagePicker() {
  const { t, i18n } = useTranslation("app");
  return (
    <Box>
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 600,
          color: (muiTheme) => muiTheme.thingport.headingText,
        }}
      >
        {t("profile.language.heading")}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: 1.5,
        }}
      >
        {t("profile.language.subtitle")}
      </Typography>
      <Paper
        variant="outlined"
        sx={{ p: 2.5, borderColor: (muiTheme) => (muiTheme.palette.mode === "dark" ? "transparent" : "divider") }}
      >
        <Stack spacing={1}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const selected = (i18n.resolvedLanguage || i18n.language || "").startsWith(lang.code);
            return (
              <ButtonBase
                key={lang.code}
                onClick={() => {
                  void i18n.changeLanguage(lang.code);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "left",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  bgcolor: selected ? "action.selected" : "transparent",
                  p: 1.5,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {lang.label}
                </Typography>
                {selected && <CheckIcon fontSize="small" color="primary" />}
              </ButtonBase>
            );
          })}
        </Stack>
      </Paper>
    </Box>
  );
}

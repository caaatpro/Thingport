import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import ResendVerificationButton from "./ResendVerificationButton";

type Props = {
  email: string;
};

export default function CheckEmailPanel({ email }: Props) {
  const { t } = useTranslation("app");

  return (
    <Stack
      spacing={2}
      sx={{
        alignItems: "center",
        textAlign: "center",
        py: 1,
      }}
    >
      <MarkEmailReadIcon sx={{ fontSize: 40, color: "primary.main" }} />
      <Typography variant="h6">{t("auth.checkEmail.heading")}</Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
        }}
      >
        {t("auth.checkEmail.body", { email })}
      </Typography>
      <ResendVerificationButton email={email} />
    </Stack>
  );
}

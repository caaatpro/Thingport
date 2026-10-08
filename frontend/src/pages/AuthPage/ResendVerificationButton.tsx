import React from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { authApi } from "../../api/auth";

type Props = {
  email: string;
};

type State = "idle" | "sending" | "sent" | "error";

/** The backend's reply is deliberately generic, so there's nothing more specific to show. */
export default function ResendVerificationButton({ email }: Props) {
  const { t } = useTranslation("app");
  const [state, setState] = React.useState<State>("idle");

  const handleClick = async () => {
    setState("sending");
    try {
      await authApi.resendVerification(email);
      setState("sent");
    } catch {
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <Typography
        variant="body2"
        sx={{
          color: "success.main",
        }}
      >
        {t("auth.checkEmail.resent")}
      </Typography>
    );
  }

  return (
    <Button
      variant="outlined"
      size="small"
      onClick={handleClick}
      disabled={state === "sending"}
      startIcon={state === "sending" ? <CircularProgress size={14} /> : undefined}
    >
      {state === "sending"
        ? t("auth.checkEmail.resending")
        : state === "error"
          ? t("auth.checkEmail.resendFailed")
          : t("auth.checkEmail.resendButton")}
    </Button>
  );
}

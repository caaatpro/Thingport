import { useTranslation } from "react-i18next";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";

type Props = {
  visibility?: "private" | "shared";
  /** When the resource is shared with the viewer by someone else. */
  ownerName?: string | null;
  compact?: boolean;
};

/** 🔒 Private / 👥 Shared pill, used on cards and detail pages. */
export default function VisibilityBadge({ visibility, ownerName, compact }: Props) {
  const { t } = useTranslation("models");
  const shared = visibility === "shared";
  const label = ownerName
    ? t("visibility.sharedBy", { name: ownerName })
    : t(shared ? "visibility.shared" : "visibility.private");
  const chip = (
    <Chip
      size="small"
      icon={shared || ownerName ? <PeopleOutlineIcon /> : <LockOutlinedIcon />}
      label={compact ? undefined : label}
      variant="outlined"
      sx={{
        height: 22,
        bgcolor: "background.paper",
        "& .MuiChip-icon": { fontSize: 15, ml: compact ? 0.5 : undefined },
        "& .MuiChip-label": { px: compact ? 0 : 0.75, fontSize: 11 },
        ...(compact ? { width: 24, "& .MuiChip-label": { display: "none" } } : {}),
      }}
    />
  );
  return compact ? <Tooltip title={label}>{chip}</Tooltip> : chip;
}

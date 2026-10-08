import { useTranslation } from "react-i18next";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { type PrintSortMode } from "../../api/prints";

const SORT_MODES: PrintSortMode[] = ["newest", "popular", "downloads"];

type Props = {
  value: PrintSortMode;
  onChange: (mode: PrintSortMode) => void;
};

/** "Popular" sorts by views, "Downloads" by print count. */
export default function SortTabs({ value, onChange }: Props) {
  const { t } = useTranslation("models");
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      aria-label={t("sort.label", { defaultValue: "Sort" })}
      onChange={(_, mode: PrintSortMode | null) => mode && onChange(mode)}
    >
      {SORT_MODES.map((mode) => (
        <ToggleButton key={mode} value={mode}>
          {t(`sort.${mode}`)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

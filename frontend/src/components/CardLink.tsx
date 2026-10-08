import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import Box from "@mui/material/Box";

type Props = {
  to: string;
  label: string;
  /** Return true to swallow a plain click (e.g. selecting instead of opening). Modified clicks always open normally. */
  onPlainClick?: () => boolean | void;
};

/**
 * A real link stretched over a whole card, so middle-click, Ctrl/Cmd-click and "open in new tab" work while the
 * card keeps its own buttons: give those `position: relative` and a `zIndex` above this overlay's (the parent needs
 * `position: relative` too).
 */
export default function CardLink({ to, label, onPlainClick }: Props) {
  return (
    <Box
      component={Link}
      to={to}
      aria-label={label}
      onClick={(event: MouseEvent) => {
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
        if (!modified && onPlainClick?.()) event.preventDefault();
      }}
      sx={{ position: "absolute", inset: 0, zIndex: 1, borderRadius: "inherit" }}
    />
  );
}

/** Lifts a card's own controls above the stretched link. */
export const aboveCardLink = { position: "relative", zIndex: 2 } as const;

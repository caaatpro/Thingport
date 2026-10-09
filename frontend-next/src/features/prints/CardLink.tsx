import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

type Props = {
  to: string;
  /** Accessible name of the link (the card's title). */
  label: string;
  /** Return true to swallow a plain click (e.g. select instead of open). Modified clicks always open normally. */
  onPlainClick?: () => boolean | void;
};

/**
 * A real link stretched over a whole card, so middle-click, Ctrl/Cmd-click and "open in new tab" work while the
 * card keeps its own buttons: give those `aboveCardLink` (or `absolute z-[3]`). The card needs `relative`.
 */
export function CardLink({ to, label, onPlainClick }: Props) {
  return (
    <Link
      to={to}
      aria-label={label}
      onClick={(event: MouseEvent) => {
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
        if (!modified && onPlainClick?.()) event.preventDefault();
      }}
      className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    />
  );
}

/** Lifts a card's own controls above the stretched link (for elements that are not already absolutely positioned). */
export const aboveCardLink = "relative z-[2]";

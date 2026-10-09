import type { Print } from "@/api/prints";
import { StarToggle } from "./StarToggle";
import { useFavoriteToggle } from "./useFavoriteToggle";

/** The favourite star for one model (detail header, cards, rows). */
export function FavoriteButton({ print, size = 20, variant = "ghost", buttonSize = "md", className }: {
  print: Print;
  size?: number;
  variant?: "ghost" | "overlay";
  buttonSize?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { isFavorite, toggle, label } = useFavoriteToggle(print);
  return (
    <StarToggle
      active={isFavorite}
      onClick={() => void toggle()}
      label={label}
      size={size}
      variant={variant}
      buttonSize={buttonSize}
      className={className}
    />
  );
}

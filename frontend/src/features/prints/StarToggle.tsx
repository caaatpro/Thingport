import { useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { IconButton, cn } from "@/ui";

type Props = {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Accessible name and tooltip, e.g. "Add to Favourites". */
  label: string;
  /** Glyph size in px. */
  size?: number;
  variant?: "ghost" | "overlay";
  buttonSize?: "sm" | "md" | "lg";
  className?: string;
};

/** The favourite star. Pops only on an actual inactive -> active change while mounted, never on first render. */
export function StarToggle({
  active,
  onClick,
  disabled,
  label,
  size = 18,
  variant = "ghost",
  buttonSize = "sm",
  className,
}: Props) {
  const starRef = useRef<SVGSVGElement | null>(null);
  const wasActive = useRef(active);

  useEffect(() => {
    const burst = active && !wasActive.current;
    wasActive.current = active;
    const star = starRef.current;
    if (!burst || typeof star?.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = star.animate(
      [{ transform: "scale(0.4)" }, { transform: "scale(1.35)", offset: 0.6 }, { transform: "scale(1)" }],
      { duration: 450, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [active]);

  return (
    <IconButton
      label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size={buttonSize}
      className={className}
    >
      <Star
        ref={starRef}
        aria-hidden
        style={{ width: size, height: size }}
        className={cn("transition-colors", active ? "fill-warning text-warning" : "text-subtle")}
      />
    </IconButton>
  );
}

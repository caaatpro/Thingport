import { useState } from "react";
import { cn } from "./cn";

type Props = {
  src?: string | null;
  /** Used for the initial and the accessible name. */
  name?: string | null;
  size?: number;
  className?: string;
};

/** A round avatar image that falls back to the person's initial. */
export function Avatar({ src, name, size = 28, className }: Props) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      title={name || undefined}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-muted",
        className,
      )}
    >
      {src && !failed ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
      {name ? <span className="sr-only">{name}</span> : null}
    </span>
  );
}

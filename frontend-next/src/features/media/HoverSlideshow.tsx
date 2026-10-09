import { useEffect, useState } from "react";

// Sooner first change, but not so soon that a passing pointer flashes it.
const FIRST_SLIDE_DELAY_MS = 500;
const SLIDE_INTERVAL_MS = 1400;
const FADE_MS = 350;

type Props = {
  images: string[];
  alt?: string;
};

/** Mount only while it should run: images load on mount, and unmounting reveals the default
 *  instantly. The parent must be `position: relative`. */
export default function HoverSlideshow({ images, alt }: Props) {
  // null until the first tick, so the default thumbnail shows until the first fade-in.
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (images.length === 0) return;
    let timer = window.setTimeout(function tick() {
      setActive((current) => (current === null ? 0 : (current + 1) % images.length));
      timer = window.setTimeout(tick, SLIDE_INTERVAL_MS);
    }, FIRST_SLIDE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [images.length]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {images.map((src, idx) => (
        <img
          key={src}
          src={src}
          alt={idx === active ? (alt ?? "") : ""}
          aria-hidden={idx !== active}
          // The outgoing slide stays opaque until the fade finishes, so the default never shows through.
          style={{ transitionDuration: idx === active ? `${FADE_MS}ms` : "0ms", transitionDelay: idx === active ? "0ms" : `${FADE_MS}ms` }}
          className={`absolute inset-0 size-full object-cover transition-opacity motion-reduce:transition-none ${
            idx === active ? "z-10 opacity-100" : "z-0 opacity-0"
          }`}
        />
      ))}
    </div>
  );
}

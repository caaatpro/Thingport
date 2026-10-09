import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { IconButton } from "@/ui";

const SHOW_AFTER_PX = 400;

/** Appears on long pages. The app scrolls at the window level, so one listener covers every route. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;
  return (
    <IconButton
      label="Back to top"
      variant="overlay"
      size="lg"
      className="fixed right-5 bottom-5 z-30 animate-slide-up border border-border rounded-full"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="size-5" aria-hidden />
    </IconButton>
  );
}

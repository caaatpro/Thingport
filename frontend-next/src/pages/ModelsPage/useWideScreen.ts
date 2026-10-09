import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const snapshot = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY).matches : true);

/** True when there is room for the categories side column (lg and up); below that the page uses a dropdown. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

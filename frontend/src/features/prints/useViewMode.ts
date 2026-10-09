import { useCallback, useState } from "react";

export type ViewMode = "grid" | "list";

export const VIEW_MODE_KEY = "thingport.library.view";

function readView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** Grid or list for model collections, remembered in this browser. Safe when storage is blocked. */
export function useViewMode(): [ViewMode, (view: ViewMode) => void] {
  const [view, setViewState] = useState<ViewMode>(readView);
  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // The choice just won't persist.
    }
  }, []);
  return [view, setView];
}

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { resolveImportTarget, type ImportTarget } from "./logic";

/** Where uploads and imports should go right now, derived from the URL (never from props). */
export function useImportTarget(): ImportTarget {
  const { pathname, search } = useLocation();
  return useMemo(() => resolveImportTarget(pathname, search), [pathname, search]);
}

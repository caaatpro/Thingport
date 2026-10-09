import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { settingsApi } from "../api/settings";
import type { ResolvedTheme, ThemeSelection } from "../constants/settingsOptions";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { useAuth } from "./auth";

type ThemeState = {
  selection: ThemeSelection;
  resolved: ResolvedTheme;
  setSelection: (selection: ThemeSelection) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);
const LOCAL_KEY = "thingport_theme";

function readLocal(): ThemeSelection {
  try {
    const v = window.localStorage.getItem(LOCAL_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Storage can be blocked; fall through.
  }
  return "system";
}

/**
 * Applies the `dark` class to <html>. The choice is kept per account on the server (so it follows you to other
 * devices) and mirrored in localStorage so the sign-in page and the first paint match.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [selection, setSelectionState] = useState<ThemeSelection>(readLocal);
  const resolved = useResolvedTheme(selection);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    settingsApi
      .getTheme()
      .then(({ theme }) => {
        // Null means never set on the server: keep what this browser has.
        if (!cancelled && theme) setSelectionState(theme);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setSelection = useCallback((next: ThemeSelection) => {
    setSelectionState(next);
    try {
      window.localStorage.setItem(LOCAL_KEY, next);
    } catch {
      // Not persisted locally; the server copy still is.
    }
    void settingsApi.updateTheme(next).catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_KEY, selection);
    } catch {
      // Ignore.
    }
  }, [selection]);

  const value = useMemo(() => ({ selection, resolved, setSelection }), [selection, resolved, setSelection]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

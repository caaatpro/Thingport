import { useEffect, useState } from "react";
import { settingsApi } from "../api/settings";

// Shared by every mounted instance so there's one request, and saves propagate to all of them.
let cached: string | null | undefined; // undefined = not loaded yet
let inFlight: Promise<string | null> | null = null;
const listeners = new Set<(value: string | null) => void>();

function load(): Promise<string | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = settingsApi
      .getSlicer()
      .then((res) => {
        cached = res.slicer ?? null;
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function setCachedSlicerPreference(value: string | null) {
  cached = value;
  listeners.forEach((listener) => listener(value));
}

export function useSlicerPreference(): string | null {
  const [value, setValue] = useState<string | null>(cached ?? null);

  useEffect(() => {
    let cancelled = false;
    void load().then((v) => {
      if (!cancelled) setValue(v);
    });
    listeners.add(setValue);
    return () => {
      cancelled = true;
      listeners.delete(setValue);
    };
  }, []);

  return value;
}

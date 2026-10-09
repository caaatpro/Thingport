import { useEffect, useState } from "react";
import { settingsApi } from "../api/settings";

// Shared by every author link so there's one request, and saves propagate to all of them.
let cached: boolean | undefined; // undefined = not loaded yet
let inFlight: Promise<boolean> | null = null;
const listeners = new Set<(value: boolean) => void>();

function load(): Promise<boolean> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = settingsApi
      .getAuthorPreview()
      .then((res) => {
        cached = res.enabled;
        return cached;
      })
      // A failed load shouldn't silently switch the feature off.
      .catch(() => true)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function setCachedAuthorPreviewEnabled(value: boolean) {
  cached = value;
  listeners.forEach((listener) => listener(value));
}

export function useAuthorPreviewEnabled(): boolean {
  const [value, setValue] = useState<boolean>(cached ?? true);

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

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type PreviewMode } from "../api/settings";
import { loadSettings, saveSettings } from "../utils/settings";
import { useAuth } from "./auth";

/** How 3D previews are produced for this instance: automatic, on demand, or off (admin setting). */
export function usePreviewMode(): PreviewMode {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ["settings", "previews"],
    queryFn: () => settingsApi.getPreviews(),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
  return data?.mode ?? "automatic";
}

export function useSetPreviewMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: PreviewMode) => settingsApi.updatePreviews(mode),
    onSuccess: (result) => queryClient.setQueryData(["settings", "previews"], result),
  });
}

/**
 * The MakerWorld session cookie is write-only on the server, so this browser keeps its own copy to send with
 * its import requests.
 */
export function useMakerWorldCookie(): [string, (cookie: string) => void] {
  const [cookie, setCookie] = useState(() => loadSettings().makerworld.cookie);
  const update = useCallback((next: string) => {
    setCookie(next);
    saveSettings({ makerworld: { cookie: next } });
  }, []);
  return [cookie, update];
}

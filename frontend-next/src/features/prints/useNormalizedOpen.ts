import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UnauthorizedError } from "@/api/client";
import { printsApi } from "@/api/prints";
import { useToast } from "@/ui";
import type { SlicerTarget } from "./useOpenInSlicer";

export type NormalizeState = "idle" | "preparing" | "ready";

const POLL_MS = 2000;

/** "Open normalized in <slicer>": asks the server for a normalized copy and polls until it's built, so no
 *  request has to outlast a proxy timeout. A cached copy opens straight away. A slow one ends in
 *  "ready" and needs a second click: browsers only launch a slicer's protocol right after a click. */
export function useNormalizedOpen(printId: string, onOpened: () => void) {
  const toast = useToast();
  const [states, setStates] = useState<Record<string, NormalizeState>>({});
  // Set on every mount: StrictMode unmounts and remounts once in development.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A mutation (not a bare fetch) so a 401 signs the user out through the query client's central handler.
  const { mutateAsync: normalize } = useMutation({
    mutationFn: (plateId: string) => printsApi.normalizePlate(printId, plateId),
  });

  const setState = useCallback((key: string, state: NormalizeState) => {
    if (mounted.current) setStates((prev) => ({ ...prev, [key]: state }));
  }, []);

  const stateOf = useCallback((target: SlicerTarget): NormalizeState => states[target.key] ?? "idle", [states]);

  /** Resolves true when the slicer was launched, so a menu can close. */
  const open = useCallback(
    async (target: SlicerTarget): Promise<boolean> => {
      const launch = () => {
        window.location.href = target.href;
        setState(target.key, "idle");
        onOpened();
        return true;
      };
      const current = states[target.key] ?? "idle";
      if (current === "ready") return launch();
      if (current === "preparing" || !target.plate) return false;

      setState(target.key, "preparing");
      try {
        let { status } = await normalize(target.plate.id);
        if (status === "ready") return launch();
        while (status === "preparing") {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (!mounted.current) return false;
          ({ status } = await normalize(target.plate.id));
        }
        if (status === "failed") throw new Error("Normalizing failed");
        setState(target.key, "ready");
        return false;
      } catch (err) {
        setState(target.key, "idle");
        if (!(err instanceof UnauthorizedError) && mounted.current) {
          toast.error("Couldn't prepare a normalized copy of this file. Use the regular Open action instead.");
        }
        return false;
      }
    },
    [states, normalize, onOpened, setState, toast],
  );

  return { stateOf, open };
}

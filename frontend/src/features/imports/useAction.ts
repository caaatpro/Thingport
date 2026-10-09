import { useCallback, useState } from "react";
import { errorMessage } from "@/app/queryClient";

/** Runs an async action for a dialog: tracks `busy`, and captures a failure as `error` instead of throwing. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Resolves true when the action finished without throwing. */
  const run = useCallback(
    async (action: () => Promise<void>, fallback = "Import failed. Try again."): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await action();
        return true;
      } catch (err) {
        setError(errorMessage(err, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, error, setError, run };
}

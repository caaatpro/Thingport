import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { CollectionPromptConfig, ModePromptConfig, Prompt, ZipPromptConfig } from "./prompts";

// The heavy dialogs stay out of the shell bundle until the first time one is needed.
const ImportModeModal = lazy(() => import("./ImportModeModal"));
const ZipImportModal = lazy(() => import("./ZipImportModal"));
const CollectionImportModal = lazy(() => import("./CollectionImportModal"));

/**
 * One prompt at a time. `ask.*` opens a dialog and resolves when it closes (after finishing or cancelling), so
 * the calling flow can simply `await` it. Render `modal` once next to the caller.
 */
export function usePrompts() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const open = useCallback((next: Prompt) => {
    if (resolveRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      setPrompt(next);
    });
  }, []);

  const close = useCallback(() => {
    setPrompt(null);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  const ask = useMemo(
    () => ({
      mode: (config: ModePromptConfig) => open({ kind: "mode", config }),
      zip: (config: ZipPromptConfig) => open({ kind: "zip", config }),
      collection: (config: CollectionPromptConfig) => open({ kind: "collection", config }),
    }),
    [open],
  );

  let modal: ReactNode = null;
  if (prompt?.kind === "mode") modal = <ImportModeModal config={prompt.config} onClose={close} />;
  else if (prompt?.kind === "zip") modal = <ZipImportModal config={prompt.config} onClose={close} />;
  else if (prompt?.kind === "collection") modal = <CollectionImportModal config={prompt.config} onClose={close} />;

  return { ask, isOpen: prompt !== null, modal: <Suspense fallback={null}>{modal}</Suspense> };
}

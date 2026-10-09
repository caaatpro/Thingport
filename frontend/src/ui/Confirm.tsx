import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes and other things that can't be undone. */
  destructive?: boolean;
};

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** Mount once. `const confirm = useConfirm(); if (await confirm({ message: "Delete it?", destructive: true })) …` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((options) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setPending(options);
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal
        open={pending !== null}
        onOpenChange={(open) => !open && settle(false)}
        title={pending?.title ?? (pending?.destructive ? "Are you sure?" : "Please confirm")}
        size="sm"
        footer={
          <>
            <Button onClick={() => settle(false)}>{pending?.cancelLabel ?? "Cancel"}</Button>
            <Button variant={pending?.destructive ? "danger" : "primary"} onClick={() => settle(true)}>
              {pending?.confirmLabel ?? (pending?.destructive ? "Delete" : "Confirm")}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{pending?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

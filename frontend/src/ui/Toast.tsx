import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "./cn";

type Tone = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; tone: Tone; message: string };

export type Toaster = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<Toaster | null>(null);

const TONES = {
  success: { Icon: CheckCircle2, cls: "text-success" },
  error: { Icon: XCircle, cls: "text-danger" },
  info: { Icon: Info, cls: "text-info" },
  warning: { Icon: TriangleAlert, cls: "text-warning" },
} as const;

const LIFETIME_MS = 4500;

/** Mount once near the root. Messages stack bottom-centre and dismiss themselves. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss],
  );

  const toaster = useMemo<Toaster>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
      warning: (m) => push("warning", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={toaster}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map(({ id, tone, message }) => {
          const { Icon, cls } = TONES[tone];
          return (
            <div
              key={id}
              role={tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex max-w-md animate-slide-up items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg shadow-overlay"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", cls)} aria-hidden />
              <span className="min-w-0 flex-1 break-words">{message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(id)}
                className="-mr-1 shrink-0 rounded p-0.5 text-subtle hover:text-fg"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Toaster {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

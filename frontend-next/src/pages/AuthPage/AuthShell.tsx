import { useEffect, type ReactNode } from "react";
import { Wordmark } from "@/layout/Brand";

type Props = {
  /** The page's h1 (visually hidden: the card shows the logo) and the browser tab title. */
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** The centred card on a soft branded backdrop that every signed-out page sits in. */
export function AuthShell({ title, subtitle, children }: Props) {
  useEffect(() => {
    document.title = `${title} · Thingport`;
    return () => {
      document.title = "Thingport";
    };
  }, [title]);
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_32rem_at_50%_-8rem,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_70%),radial-gradient(40rem_28rem_at_100%_100%,color-mix(in_srgb,var(--color-accent)_8%,transparent),transparent_70%)]"
      />
      <main className="relative w-full max-w-[26rem]">
        <div className="rounded-dialog border border-border bg-surface p-6 shadow-overlay sm:p-8">
          <h1 className="sr-only">{title}</h1>
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Wordmark alt="Thingport" className="h-9" />
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

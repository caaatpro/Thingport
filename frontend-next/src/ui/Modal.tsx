import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "./cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Right-aligned action row, usually a Cancel and a primary Button. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  children?: ReactNode;
  /** Keep the dialog open on outside click/Escape (e.g. while a request is in flight). */
  locked?: boolean;
  /** Omit the corner close button when the footer already offers a "Close" action. */
  hideClose?: boolean;
  className?: string;
};

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

/** A centered dialog with a title, scrolling body and a pinned footer. Focus is trapped and restored. */
export function Modal({ open, onOpenChange, title, description, footer, size = "md", children, locked, hideClose, className }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (locked && !next ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[min(90vh,820px)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col rounded-dialog border border-border bg-surface shadow-overlay focus:outline-none",
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight text-fg">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
              ) : null}
            </div>
            {hideClose ? null : (
            <Dialog.Close
              aria-label="Close"
              disabled={locked}
              className="-mt-1 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-3.5">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

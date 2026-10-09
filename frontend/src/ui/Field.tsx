import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const controlBase =
  "w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-shadow hover:border-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return <input ref={ref} type={type} className={cn(controlBase, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlBase, "min-h-20 py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

type FieldProps = {
  label: string;
  /** Muted helper text under the control. */
  hint?: ReactNode;
  /** Error text; also marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Receives the id to attach to the control so the label is wired up. */
  children: (control: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

/** A label + control + hint/error, with the ids wired for assistive tech: `<Field label="Name">{(p) => <Input {...p} />}</Field>`. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(note ? { "aria-describedby": noteId } : {}),
      })}
      {note && (
        <p id={noteId} className={cn("text-xs", error ? "text-danger" : "text-muted")}>
          {note}
        </p>
      )}
    </div>
  );
}

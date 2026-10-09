import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { colorForTag } from "../utils/tagColors";
import { cn } from "./cn";

type BadgeProps = { tag: string; onRemove?: () => void; className?: string };

/** A tag chip tinted by a stable colour per tag name. With `onRemove` it shows a × button. */
export function TagBadge({ tag, onRemove, className }: BadgeProps) {
  const colors = colorForTag(tag);
  return (
    <span
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className="truncate">{tag}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${tag}`}
          onClick={onRemove}
          className="-mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

function normalized(tag: string) {
  return tag.trim().replace(/\s+/g, " ");
}

/** Chips plus a text field: Enter or comma adds, Backspace on an empty field removes the last, blur commits. */
export function TagInput({ value, onChange, placeholder, id, disabled, className, ...aria }: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addTag = (raw: string) => {
    const tag = normalized(raw);
    setDraft("");
    if (!tag) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    if (key === "Enter" || key === ",") {
      event.preventDefault();
      addTag(draft);
    } else if (key === "Backspace" && draft === "" && value.length) {
      event.preventDefault();
      removeTag(value.length - 1);
    }
  };

  return (
    // The wrapper only forwards clicks to the input; the input itself is the focusable control.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
        className,
      )}
    >
      {value.map((tag, index) => (
        <TagBadge key={tag} tag={tag} onRemove={disabled ? undefined : () => removeTag(index)} />
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={disabled}
        aria-label={aria["aria-label"]}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addTag(draft)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-28 flex-1 bg-transparent py-0.5 text-fg outline-none placeholder:text-subtle"
      />
    </div>
  );
}

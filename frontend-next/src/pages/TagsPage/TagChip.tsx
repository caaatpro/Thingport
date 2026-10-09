import { Bookmark, BookmarkCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { TagSummary } from "@/api/tags";
import { cn } from "@/ui";

type Props = { tag: TagSummary; busy?: boolean; onToggleBookmark: () => void };

/** A tag as a link to its models, with a bookmark toggle beside it. */
export function TagChip({ tag, busy, onToggleBookmark }: Props) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface text-sm text-fg shadow-card transition-colors hover:border-border-strong">
      <Link to={`/models/tags/${encodeURIComponent(tag.name)}`} className="rounded-l-full py-1.5 pr-1 pl-3 font-medium hover:text-accent-text">
        {tag.name}
        <span className="ml-1.5 text-xs font-normal text-muted">{tag.count}</span>
      </Link>
      <button
        type="button"
        aria-label={`${tag.bookmarked ? "Remove bookmark for" : "Bookmark"} ${tag.name}`}
        aria-pressed={tag.bookmarked}
        disabled={busy}
        onClick={onToggleBookmark}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-r-full text-subtle transition-colors hover:text-fg disabled:opacity-50",
          tag.bookmarked && "text-accent-text hover:text-accent-text",
        )}
      >
        {tag.bookmarked ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      </button>
    </span>
  );
}

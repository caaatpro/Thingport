import { Link } from "react-router-dom";
import { Eye, Folder, Printer } from "lucide-react";
import type { Print } from "@/api/prints";
import { useAuth } from "@/app/auth";
import { printProviderInfo } from "@/constants/importProviders";
import PrintThumb from "@/features/media/PrintThumb";
import { useGravatarUrl } from "@/hooks/useGravatarUrl";
import { Avatar, Badge, Checkbox, cn } from "@/ui";
import { AuthorHoverCard } from "./AuthorHoverCard";
import { authorDisplay } from "./authorDisplay";
import { aboveCardLink, CardLink } from "./CardLink";
import { FavoriteButton } from "./FavoriteButton";
import { ModelActionsMenu } from "./ModelActionsMenu";
import { printMeta } from "./printMeta";
import { RollingNumber } from "./RollingNumber";
import { VisibilityBadge } from "./VisibilityBadge";

export type PrintSelection = { selected: Set<string>; toggle: (id: string) => void };

type Props = {
  print: Print;
  selection?: PrintSelection;
  /** Only for a real collection; shows "Remove from collection". */
  collectionId?: string;
};

/** One model as a card. A real link covers the whole card; the card's own controls sit above it. */
export function ModelCard({ print, selection, collectionId }: Props) {
  const { user: viewer } = useAuth();
  const viewerAvatarUrl = useGravatarUrl(viewer?.email, 40);
  const meta = printMeta(print);
  const author = authorDisplay(print, viewer);
  const providerInfo = printProviderInfo(print.source_provider);
  const selectable = Boolean(selection);
  const selected = selection?.selected.has(print.id) ?? false;
  const selectionActive = (selection?.selected.size ?? 0) > 0;
  const toggleSelect = () => selection?.toggle(print.id);
  const shownTags = print.tags.slice(0, 3);
  const moreTags = print.tags.length - shownTags.length;
  const line1 = [meta.exts || null, meta.size, meta.dims].filter(Boolean);

  const authorRow = (
    <>
      <Avatar
        src={author.avatarUrl || (author.showViewerAsAuthor ? viewerAvatarUrl : undefined)}
        name={author.name}
        size={20}
      />
      <span className="truncate text-xs">{author.name || "Unknown"}</span>
    </>
  );

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-card border bg-surface shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-hover",
        selected ? "border-accent ring-2 ring-accent" : "border-border",
      )}
    >
      <CardLink
        to={`/models/${print.id}`}
        label={meta.title}
        onPlainClick={() => {
          if (!(selectionActive && selectable)) return false;
          toggleSelect();
          return true;
        }}
      />
      {/* z-0 makes this its own stacking context, so layered thumbnails stay under the badge and controls. */}
      <div className="relative z-0 aspect-[4/3] w-full overflow-hidden bg-canvas">
        <PrintThumb print={print} variant="card" />
      </div>

      {print.source_provider ? (
        <span
          style={{ backgroundColor: providerInfo.color, ...(providerInfo.textColor ? { color: providerInfo.textColor } : {}) }}
          className={cn(
            "pointer-events-none absolute top-2 z-[2] rounded-md px-2 py-0.5 text-[11px] leading-snug font-semibold text-white",
            selectable ? "left-11" : "left-2",
          )}
        >
          {providerInfo.label}
        </span>
      ) : null}

      {selection ? (
        <div
          className={cn(
            "absolute top-1.5 left-1.5 z-[3] rounded-lg bg-surface p-1 shadow-card transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
            selectionActive || selected ? "opacity-100" : "opacity-0",
          )}
        >
          <Checkbox checked={selected} onCheckedChange={toggleSelect} aria-label={`Select ${meta.title}`} />
        </div>
      ) : null}

      <div className="absolute top-2 right-2 z-[3] flex gap-1">
        <FavoriteButton print={print} size={18} variant="overlay" buttonSize="sm" />
        <ModelActionsMenu print={print} collectionId={collectionId} variant="overlay" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 pt-2 pb-3">
        <div className="flex min-w-0 items-center gap-1">
          <h3 title={meta.title} className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {meta.title}
          </h3>
          {meta.shared ? (
            <VisibilityBadge
              compact
              visibility={print.visibility}
              ownerName={print.is_owner === false ? print.owner?.display_name : null}
            />
          ) : null}
        </div>
        {line1.length > 0 ? <p className="truncate text-xs text-muted">{line1.join(" · ")}</p> : null}
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          {print.category_name ? (
            <span className="flex min-w-0 items-center gap-1" title={print.category_name}>
              <Folder className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{print.category_name}</span>
            </span>
          ) : null}
          {meta.fileCount > 1 ? <span className="shrink-0">{`${meta.fileCount} files`}</span> : null}
          {meta.created ? <span className="ml-auto shrink-0">{meta.created}</span> : null}
        </div>
        {shownTags.length > 0 || meta.processing || meta.failed ? (
          <div className="flex flex-wrap gap-1">
            {meta.processing ? <Badge>Processing…</Badge> : null}
            {meta.failed ? <Badge tone="danger">Preview failed</Badge> : null}
            {shownTags.map((tag) => (
              <Badge key={tag} tone="outline" className="max-w-[110px]">
                {tag}
              </Badge>
            ))}
            {moreTags > 0 ? <Badge tone="outline">{`+${moreTags}`}</Badge> : null}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <AuthorHoverCard authorId={author.authorId} disabled={!author.hoverEnabled}>
            {author.link ? (
              <Link
                to={author.link}
                className={cn(aboveCardLink, "flex min-w-0 items-center gap-1.5 text-muted hover:text-accent-text")}
              >
                {authorRow}
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 text-muted">{authorRow}</span>
            )}
          </AuthorHoverCard>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1" title="Views">
              <Eye className="size-3.5" aria-hidden />
              {print.view_count}
            </span>
            <span className="flex items-center gap-1" title="Prints">
              <Printer className="size-3.5" aria-hidden />
              <RollingNumber value={print.print_count} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

import { Eye, Printer } from "lucide-react";
import type { Print } from "@/api/prints";
import PrintThumb from "@/features/media/PrintThumb";
import { Badge, Checkbox, cn } from "@/ui";
import { aboveCardLink, CardLink } from "./CardLink";
import type { PrintSelection } from "./ModelCard";
import { FavoriteButton } from "./FavoriteButton";
import { ModelActionsMenu } from "./ModelActionsMenu";
import { printMeta } from "./printMeta";
import { VisibilityBadge } from "./VisibilityBadge";

type Props = {
  print: Print;
  selection?: PrintSelection;
  collectionId?: string;
};

/** One model per line, for scanning long libraries. Same actions as the card. */
export function ModelRow({ print, selection, collectionId }: Props) {
  const meta = printMeta(print);
  const selectable = Boolean(selection);
  const selected = selection?.selected.has(print.id) ?? false;
  const selectionActive = (selection?.selected.size ?? 0) > 0;
  const toggleSelect = () => selection?.toggle(print.id);
  const authorName = print.author?.name || print.author?.handle || print.creator || null;
  const detail = [meta.exts || null, meta.size, meta.dims, print.category_name].filter(Boolean);

  return (
    <article
      className={cn(
        "relative flex min-w-0 items-center gap-3 rounded-xl border bg-surface p-2 pr-3 hover:border-border-strong",
        selected ? "border-accent ring-1 ring-accent" : "border-border",
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
      {selection ? (
        <div className={cn(aboveCardLink, "flex shrink-0 p-1")}>
          <Checkbox checked={selected} onCheckedChange={toggleSelect} aria-label={`Select ${meta.title}`} />
        </div>
      ) : null}
      <div className="relative z-0 h-[72px] w-24 shrink-0 overflow-hidden rounded-lg bg-canvas">
        <PrintThumb print={print} variant="row" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 title={meta.title} className="min-w-0 truncate text-sm font-semibold text-fg">
            {meta.title}
          </h3>
          {meta.shared ? (
            <VisibilityBadge
              compact
              visibility={print.visibility}
              ownerName={print.is_owner === false ? print.owner?.display_name : null}
            />
          ) : null}
          {meta.processing ? <Badge>Processing…</Badge> : null}
          {meta.failed ? <Badge tone="danger">Preview failed</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted">
          {detail.join(" · ")}
          {authorName ? ` · ${authorName}` : ""}
        </p>
      </div>
      <div className="hidden shrink-0 gap-1 lg:flex">
        {print.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} tone="outline" className="max-w-[110px]">
            {tag}
          </Badge>
        ))}
        {print.tags.length > 3 ? <Badge tone="outline">{`+${print.tags.length - 3}`}</Badge> : null}
      </div>
      <div className="hidden min-w-24 shrink-0 items-center justify-end gap-3 text-xs text-muted sm:flex">
        <span className="flex items-center gap-1" title="Views">
          <Eye className="size-3.5" aria-hidden />
          {print.view_count}
        </span>
        <span className="flex items-center gap-1" title="Prints">
          <Printer className="size-3.5" aria-hidden />
          {print.print_count}
        </span>
      </div>
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted md:block">{meta.created ?? ""}</span>
      <div className={cn(aboveCardLink, "flex shrink-0 items-center gap-1")}>
        <FavoriteButton print={print} size={18} buttonSize="sm" />
        <ModelActionsMenu print={print} collectionId={collectionId} />
      </div>
    </article>
  );
}

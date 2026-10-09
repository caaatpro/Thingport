import { Link } from "react-router-dom";
import { Boxes, Lock } from "lucide-react";
import type { Collection } from "@/api/collections";
import PrintThumb from "@/features/media/PrintThumb";
import { VisibilityBadge } from "@/features/prints";
import { Card, cn } from "@/ui";
import { collectionDisplayName } from "@/utils/collectionDisplay";
import { CollectionActionsMenu } from "../CollectionDetailPage/CollectionActionsMenu";

const COVER_TILES = 4;

function CoverTile({ print, extra }: { print: Collection["cover_items"][number]; extra?: number }) {
  return (
    <Link to={`/models/${print.id}`} aria-label={print.title || print.name} className="relative block size-full overflow-hidden">
      <PrintThumb print={print} />
      {extra ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">+{extra}</span>
      ) : null}
    </Link>
  );
}

/** One collection: a mosaic of up to four models (each a link to that model), then its name, count and sharing. */
export function CollectionCard({ collection }: { collection: Collection }) {
  const tiles = collection.cover_items.slice(0, COVER_TILES);
  const extra = collection.item_count > COVER_TILES ? collection.item_count - COVER_TILES : 0;
  const name = collectionDisplayName(collection);
  const system = Boolean(collection.system_key);
  const notOwner = collection.is_owner === false;
  const count = `${collection.item_count} ${collection.item_count === 1 ? "model" : "models"}`;

  return (
    <Card padding="none" interactive className="group relative overflow-hidden">
      <div className="aspect-[4/3] w-full bg-surface-2">
        {tiles.length === 0 ? (
          <div className="flex size-full items-center justify-center text-xs text-subtle">No models yet</div>
        ) : (
          <div className={cn("grid size-full gap-0.5", tiles.length > 1 && "grid-cols-2 grid-rows-2")}>
            {tiles.map((print, index) => (
              <CoverTile key={print.id} print={print} extra={tiles.length > 1 && index === tiles.length - 1 ? extra : undefined} />
            ))}
          </div>
        )}
      </div>

      {system ? null : (
        <div className="absolute top-2 right-2 z-[3]">
          <CollectionActionsMenu collection={collection} overlay />
        </div>
      )}

      <Link
        to={`/models/collections/${collection.id}`}
        className="block p-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {system ? <Lock className="size-3.5 shrink-0 text-subtle" aria-hidden /> : null}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg" title={name}>
            {name}
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Boxes className="size-3.5" aria-hidden />
            {count}
          </span>
          {system ? null : (
            <VisibilityBadge visibility={collection.visibility} ownerName={notOwner ? collection.owner?.display_name : null} />
          )}
        </span>
      </Link>
    </Card>
  );
}

import { Bookmark, BookmarkCheck } from "lucide-react";
import type { Collection } from "@/api/collections";
import { IconButton } from "@/ui";
import { useCollectionBookmark } from "./useCollectionBookmark";

export function CollectionBookmarkButton({ collection }: { collection: Collection }) {
  const { bookmarked, label, toggle, pending } = useCollectionBookmark(collection);
  return (
    <IconButton label={label} variant="outline" aria-pressed={bookmarked} disabled={pending} onClick={toggle}>
      {bookmarked ? <BookmarkCheck className="size-4 text-accent-text" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
    </IconButton>
  );
}

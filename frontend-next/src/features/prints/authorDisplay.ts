import type { AuthUser } from "@/api/auth";
import type { Print } from "@/api/prints";
import { SELF_AUTHOR_ID } from "@/constants/selfAuthor";

/** Who to show as the author of a print; a direct upload has none, so it falls back to the viewer. */
export function authorDisplay(print: Print, viewer: AuthUser | null | undefined) {
  const author = print.author;
  const showViewerAsAuthor = !author?.name && !author?.handle && !print.creator && !print.source_provider && Boolean(viewer);
  const name = author?.name || author?.handle || print.creator || (showViewerAsAuthor ? viewer?.display_name : null) || null;
  // Not clickable when there is no Author id behind the fallback.
  const link = author ? `/authors/${author.id}` : showViewerAsAuthor ? `/authors/${SELF_AUTHOR_ID}` : null;
  return {
    name,
    link,
    authorId: author ? author.id : SELF_AUTHOR_ID,
    hoverEnabled: Boolean(author) || showViewerAsAuthor,
    showViewerAsAuthor,
    avatarUrl: author?.avatar_url ?? null,
  };
}

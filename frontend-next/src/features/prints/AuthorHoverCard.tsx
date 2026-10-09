import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import { authorsApi, type Author } from "@/api/authors";
import { printsApi, type Print } from "@/api/prints";
import { useAuth } from "@/app/auth";
import { printProviderInfo } from "@/constants/importProviders";
import { SELF_AUTHOR_ID } from "@/constants/selfAuthor";
import { useAuthorPreviewEnabled } from "@/hooks/useAuthorPreviewEnabled";
import { useGravatarUrl } from "@/hooks/useGravatarUrl";
import { Avatar, Skeleton } from "@/ui";

const PREVIEW_MODEL_COUNT = 3;
const PREVIEW_SLOTS = ["a", "b", "c"];
// Long enough that sweeping across a grid doesn't pop cards open.
const ENTER_DELAY_MS = 450;

type AuthorPreview = { author: Author | null; models: Print[]; total: number };

async function loadAuthorPreview(authorId: string): Promise<AuthorPreview> {
  const [author, list] = await Promise.all([
    authorId === SELF_AUTHOR_ID ? Promise.resolve(null) : authorsApi.get(authorId),
    printsApi.list({ author_id: authorId, order_by: "newest", limit: PREVIEW_MODEL_COUNT, offset: 0 }),
  ]);
  return { author, models: list.items, total: list.total ?? list.items.length };
}

function modelThumbUrl(print: Print): string | null {
  const url = print.thumb_url || print.preview_images[0]?.url;
  return url ? printsApi.fileUrl(url) : null;
}

function AuthorPreviewCard({ authorId }: { authorId: string }) {
  const { user: viewer } = useAuth();
  const isSelf = authorId === SELF_AUTHOR_ID;
  const viewerAvatarUrl = useGravatarUrl(isSelf ? viewer?.email : undefined, 88);
  // Only mounted once the card opens, so nothing is fetched for authors nobody hovers.
  const { data: preview, isError, isPending } = useQuery({
    queryKey: ["authors", "preview", authorId],
    queryFn: () => loadAuthorPreview(authorId),
    staleTime: 60_000,
  });

  const author = preview?.author ?? null;
  const providerInfo = author ? printProviderInfo(author.provider) : null;
  const name = isSelf ? viewer?.display_name : author?.name || author?.handle;
  const handle = isSelf ? null : author?.handle;
  const avatarUrl = isSelf ? viewerAvatarUrl : author?.avatar_url;
  const coverUrl = isSelf ? viewer?.background_url : author?.background_url;
  const countLabel = preview
    ? isSelf
      ? `${preview.total} ${preview.total === 1 ? "model" : "models"} uploaded`
      : `${preview.total} ${preview.total === 1 ? "model" : "models"} imported from ${providerInfo?.label ?? "the web"}`
    : null;

  return (
    <div className="w-[258px] overflow-hidden rounded-xl border border-border bg-surface text-fg shadow-overlay">
      <div
        style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined}
        className="relative h-[120px] bg-accent bg-cover bg-center"
      >
        <Link
          to={`/authors/${authorId}`}
          className="group absolute right-3 bottom-3 left-3 flex items-center gap-3 rounded-xl bg-surface p-2 text-left shadow-card"
        >
          <Avatar src={avatarUrl} name={name} size={44} />
          <span className="min-w-0">
            {isPending ? (
              <>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-1 h-3 w-20" />
              </>
            ) : (
              <>
                <span className="block truncate text-sm font-bold text-fg group-hover:text-accent-text">
                  {name || "Unknown"}
                </span>
                {handle ? <span className="block truncate text-xs text-muted">@{handle}</span> : null}
              </>
            )}
          </span>
        </Link>
      </div>
      <div className="p-3">
        {isError ? (
          <p className="text-sm text-muted">Couldn't load this author.</p>
        ) : (
          <>
            <p className="mb-2.5 text-sm text-muted">{countLabel ?? <Skeleton className="h-4 w-44" />}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {isPending
                ? PREVIEW_SLOTS.map((slot) => <Skeleton key={slot} className="aspect-square w-full" />)
                : preview?.models.map((model) => {
                    const thumb = modelThumbUrl(model);
                    return (
                      <Link
                        key={model.id}
                        to={`/models/${model.id}`}
                        title={model.title || model.name}
                        className="aspect-square overflow-hidden rounded-lg bg-surface-2 transition-transform hover:-translate-y-px hover:shadow-card"
                      >
                        {thumb ? (
                          <img src={thumb} alt={model.title || model.name} className="size-full object-cover" />
                        ) : (
                          <span className="flex size-full items-center justify-center text-subtle">
                            <User className="size-5" aria-hidden />
                          </span>
                        )}
                      </Link>
                    );
                  })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type Props = {
  /** An Author id, or SELF_AUTHOR_ID for the viewer's own uploads. */
  authorId: string;
  /** Must accept a ref (a Link or plain element). */
  children: ReactElement;
  disabled?: boolean;
};

/** Opens an author preview on hover or keyboard focus. Fetches only once opened. Respects the instance setting. */
export function AuthorHoverCard({ authorId, children, disabled }: Props) {
  const enabled = useAuthorPreviewEnabled();
  const [open, setOpen] = useState(false);
  if (disabled || !enabled) return children;
  return (
    <RadixTooltip.Root open={open} onOpenChange={setOpen} delayDuration={ENTER_DELAY_MS}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content aria-label="Author preview" side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-[80] animate-fade-in">
          {open ? <AuthorPreviewCard authorId={authorId} /> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

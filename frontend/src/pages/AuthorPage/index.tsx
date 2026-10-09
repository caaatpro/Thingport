import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { authorsApi, type Author } from "@/api/authors";
import type { PrintSortMode } from "@/api/prints";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import {
  ModelGrid,
  ModelGridEmpty,
  ModelGridSkeleton,
  SortSegmented,
  ViewToggle,
  usePrintList,
  useViewMode,
} from "@/features/prints";
import { SELF_AUTHOR_ID } from "@/constants/selfAuthor";
import { importProviderInfo, printProviderInfo, type ImportProviderInfo } from "@/constants/importProviders";
import { useGravatarUrl } from "@/hooks/useGravatarUrl";
import { Alert, Avatar, Button, PageHeader, PageLoading, Spinner, useConfirm, useToast } from "@/ui";
import { authorProfileUrl } from "@/utils/authorProfileUrl";
import { parseSort, withSort } from "../CollectionDetailPage/sort";

/** A provider's brand colour is data (it comes from the provider list), so it is applied inline. */
function brandStyle(info: ImportProviderInfo) {
  return { backgroundColor: info.color, color: info.textColor ?? "#fff" };
}

const CHIP = "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold";

/** An author's page: profile column beside their models. Doubles as the viewer's own "My models" page for `self`. */
export default function AuthorPage() {
  const { authorId = "" } = useParams<{ authorId: string }>();
  const isSelf = authorId === SELF_AUTHOR_ID;
  const { user: viewer, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const viewerAvatar = useGravatarUrl(viewer?.email, 112);
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseSort(searchParams.get("orderBy"));
  const [view, setView] = useViewMode();
  const setSort = (mode: PrintSortMode) => setSearchParams((prev) => withSort(prev, mode));

  const authorQuery = useQuery({
    queryKey: ["author", authorId],
    queryFn: () => authorsApi.get(authorId),
    enabled: Boolean(authorId) && !isSelf,
  });
  const myLinks = useQuery({ queryKey: ["authors", "links"], queryFn: () => authorsApi.myLinks() });
  const author = authorQuery.data;
  const list = usePrintList({
    author_id: authorId,
    order_by: sort,
    enabled: Boolean(authorId) && (isSelf || Boolean(author)),
  });
  const { sentinelRef, isFetchingNextPage } = list;

  const claim = useMutation({
    mutationFn: () => authorsApi.link(authorId),
    onSuccess: async (result) => {
      updateUser(result.user);
      toast.success(`Linked "${result.author.name || result.author.handle}" to your account`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["author", authorId] }),
        queryClient.invalidateQueries({ queryKey: ["authors"] }),
      ]);
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't link this author to your account.")),
  });

  if (!isSelf && authorQuery.isPending) return <PageLoading />;
  if (!isSelf && (authorQuery.isError || !author)) {
    return (
      <>
        <PageHeader title="Author" />
        <Alert
          tone="danger"
          title="Author not found"
          action={
            <Button size="sm" onClick={() => void authorQuery.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(authorQuery.error, "They may have been removed.")}
        </Alert>
      </>
    );
  }

  const linked: Author[] = myLinks.data ?? [];
  const displayName = isSelf
    ? viewer?.display_name || "Unknown author"
    : author?.name || author?.handle || "Unknown author";
  const linkedToMe = Boolean(author && linked.some((a) => a.id === author.id));
  const providerLinked = Boolean(author && linked.some((a) => a.provider === author.provider));
  const canClaim = Boolean(author) && !author?.is_linked && !providerLinked && myLinks.isSuccess;
  const provider = author ? importProviderInfo(author.provider) : null;
  const profileUrl = author ? authorProfileUrl(author) : null;
  const bio = isSelf ? viewer?.bio : author?.bio || author?.bio_translated;
  const avatarUrl = isSelf ? viewerAvatar : author?.avatar_url;
  const backgroundUrl = isSelf ? viewer?.background_url : author?.background_url;

  const askClaim = async () => {
    const ok = await confirm({
      title: "Link this author to your account?",
      message: `This links "${displayName}" as your own identity. Your "My models" page will also list their models, and your profile bio/cover picture will be filled in from theirs if you don't already have one set.`,
      confirmLabel: "Yes, it's me",
    });
    if (ok) claim.mutate();
  };

  return (
    <>
      <PageHeader title={isSelf ? "My models" : displayName} subtitle={isSelf ? undefined : "Author"} />

      <article className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div
          aria-hidden
          className="h-36 bg-surface-2 bg-cover bg-center sm:h-44"
          // Quoted: an unquoted url() ends at the first ")", which a data: URI can contain.
          style={backgroundUrl ? { backgroundImage: `url("${backgroundUrl}")` } : undefined}
        />
        <div className="grid gap-8 p-6 md:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 md:border-r md:border-border md:pr-8">
            <Avatar
              src={avatarUrl}
              name={displayName}
              size={112}
              className="-mt-20 border-4 border-surface bg-surface-2"
            />
            <h2 className="mt-3 text-xl font-bold text-fg">{displayName}</h2>
            {!isSelf && author?.handle ? <p className="text-sm text-muted">@{author.handle}</p> : null}

            {isSelf && linked.length > 0 ? (
              <ul aria-label="Linked authors" className="mt-3 flex flex-wrap gap-2">
                {linked.map((a) => {
                  const info = printProviderInfo(a.provider);
                  return (
                    <li key={a.id}>
                      <Link to={`/authors/${a.id}`} style={brandStyle(info)} className={CHIP}>
                        {info.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {!isSelf && (provider || linkedToMe || canClaim) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {provider && profileUrl ? (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View on ${provider.label}`}
                    style={brandStyle(provider)}
                    className={CHIP}
                  >
                    {provider.label}
                  </a>
                ) : null}
                {linkedToMe ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-4" aria-hidden />
                    This is you
                  </span>
                ) : null}
                {canClaim ? (
                  <Button size="sm" loading={claim.isPending} onClick={() => void askClaim()}>
                    It&apos;s me!
                  </Button>
                ) : null}
              </div>
            ) : null}

            <h3 className="mt-6 mb-1.5 text-sm font-semibold text-fg">Bio</h3>
            <p className={bio ? "text-sm whitespace-pre-wrap text-fg" : "text-sm text-subtle"}>
              {bio || "No bio yet."}
            </p>
          </aside>

          <section aria-label="Models" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-fg">Models</h3>
              <div className="flex items-center gap-2">
                <SortSegmented value={sort} onChange={setSort} />
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>
            {list.isLoading ? (
              <ModelGridSkeleton view={view} count={6} />
            ) : list.isError ? (
              <Alert
                tone="danger"
                title="Couldn't load models"
                action={
                  <Button size="sm" onClick={() => void list.refetch()}>
                    Try again
                  </Button>
                }
              >
                {errorMessage(list.error)}
              </Alert>
            ) : list.items.length === 0 ? (
              <ModelGridEmpty title="No models from this author yet." />
            ) : (
              <>
                <ModelGrid items={list.items} view={view} />
                <div ref={sentinelRef} className="flex justify-center py-4">
                  {isFetchingNextPage ? <Spinner label="Loading more" /> : null}
                </div>
              </>
            )}
          </section>
        </div>
      </article>
    </>
  );
}

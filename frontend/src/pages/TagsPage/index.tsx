import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Tags } from "lucide-react";
import { Link } from "react-router-dom";
import { tagsApi, type TagSortMode, type TagSummary } from "@/api/tags";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Checkbox, EmptyState, Input, PageHeader, Segmented, Skeleton, useToast } from "@/ui";
import { filterTags } from "./filterTags";
import { TagChip } from "./TagChip";

const SORT_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "name", label: "Name" },
] as const;

export default function TagsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sort, setSort] = useState<TagSortMode>("popular");
  const [filter, setFilter] = useState("");
  const [hideRare, setHideRare] = useState(true);

  const query = useQuery({ queryKey: ["tags", "summary", sort], queryFn: () => tagsApi.listSummary(sort) });
  const tags = query.data;
  const visible = useMemo(() => (tags ? filterTags(tags, filter, hideRare) : []), [tags, filter, hideRare]);

  const toggle = useMutation({
    mutationFn: (tag: TagSummary) => (tag.bookmarked ? tagsApi.unbookmark(tag.name) : tagsApi.bookmark(tag.name)),
    onSuccess: (_, tag) => {
      queryClient.setQueriesData<TagSummary[]>({ queryKey: ["tags", "summary"] }, (list) =>
        list?.map((t) => (t.name === tag.name ? { ...t, bookmarked: !tag.bookmarked } : t)),
      );
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't update the bookmark. Try again.")),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
  const pendingName = toggle.isPending ? toggle.variables.name : null;

  return (
    <>
      <PageHeader title="Tags" />
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Filter tags"
            placeholder="Filter tags…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Checkbox label="Hide tags used once" checked={hideRare} onCheckedChange={setHideRare} />
        <Segmented
          label="Sort tags"
          value={sort}
          onChange={setSort}
          options={[...SORT_OPTIONS]}
          className="sm:ml-auto"
        />
      </div>

      {query.isError ? (
        <Alert
          tone="danger"
          action={
            <Button size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(query.error, "Couldn't load tags.")}
        </Alert>
      ) : !tags ? (
        <div className="flex flex-wrap gap-2" aria-busy="true">
          {Array.from({ length: 18 }, (_, i) => (
            <Skeleton key={`s${i}`} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      ) : visible.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {visible.map((tag) => (
            <li key={tag.name}>
              <TagChip tag={tag} busy={pendingName === tag.name} onToggleBookmark={() => toggle.mutate(tag)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Tags />}
          title={tags.length === 0 ? "No tags yet" : "No tags match"}
          action={
            tags.length > 0 && (filter || hideRare) ? (
              <Button
                size="sm"
                onClick={() => {
                  setFilter("");
                  setHideRare(false);
                }}
              >
                Show all tags
              </Button>
            ) : undefined
          }
        >
          {tags.length === 0 ? (
            <>
              Add tags to a model and they will show up here.{" "}
              <Link to="/models" className="text-accent-text underline-offset-4 hover:underline">
                Browse models
              </Link>
            </>
          ) : (
            "Try a different filter, or show tags used only once."
          )}
        </EmptyState>
      )}
      <p className="sr-only" aria-live="polite">
        {tags ? `${visible.length} tags` : ""}
      </p>
    </>
  );
}

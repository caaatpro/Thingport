import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Folder, Hash, Search, X } from "lucide-react";
import { printsApi } from "@/api/prints";
import { searchApi, type SearchResult } from "@/api/search";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { errorMessage } from "@/app/queryClient";
import { Kbd, Spinner, cn } from "@/ui";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const PLACEHOLDER = "Search models, collections, tags…";
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

type Row = {
  key: string;
  to: string;
  title: string;
  subtitle?: string;
  thumb?: string | null;
  kind: "model" | "collection" | "tag";
};

const modelCount = (n: number) => `${n} ${n === 1 ? "model" : "models"}`;

function toRows(result: SearchResult): { models: Row[]; collections: Row[]; tags: Row[] } {
  return {
    models: result.models.map((p) => ({
      key: `m:${p.id}`,
      to: `/models/${p.id}`,
      title: p.title || p.name,
      subtitle: p.category_name || undefined,
      thumb: p.thumb_url ? printsApi.fileUrl(p.thumb_url) : null,
      kind: "model",
    })),
    collections: result.collections.map((c) => ({
      key: `c:${c.id}`,
      to: `/models/collections/${c.id}`,
      title: c.name,
      subtitle: modelCount(c.item_count),
      kind: "collection",
    })),
    tags: result.tags.map((t) => ({
      key: `t:${t.tag}`,
      to: `/models/tags/${encodeURIComponent(t.tag)}`,
      title: t.tag,
      subtitle: modelCount(t.count),
      kind: "tag",
    })),
  };
}

const KIND_ICON = { model: Box, collection: Folder, tag: Hash } as const;

function Thumb({ row }: { row: Row }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICON[row.kind];
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas text-subtle">
      {row.thumb && !failed ? (
        <img src={row.thumb} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
    </span>
  );
}

/** Whether a keystroke target is somewhere the user is typing. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Ranking happens on the server. Ctrl/Cmd+K or "/" focuses the box from anywhere. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // The row Enter would open; moved with the arrow keys.
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const searching = debounced.length >= MIN_QUERY_LENGTH;
  const {
    data,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchApi.search(debounced),
    enabled: searching,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const { key, metaKey, ctrlKey, altKey, target } = event;
      const combo = (metaKey || ctrlKey) && key.toLowerCase() === "k";
      if (combo || (key === "/" && !isTyping(target) && !metaKey && !ctrlKey && !altKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // While the debounce is catching up, what's on screen belongs to an older query.
  const settled = searching && debounced === trimmed;
  const error = settled ? queryError : null;
  const rows = settled && data ? toRows(data) : null;
  const flat = rows ? [...rows.models, ...rows.collections, ...rows.tags] : [];
  const active = Math.min(activeIndex, Math.max(flat.length - 1, 0));
  const panelOpen = open && trimmed.length >= MIN_QUERY_LENGTH;
  const loading = !rows && !error;

  const close = () => setOpen(false);
  const finish = () => {
    setOpen(false);
    setQuery("");
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActiveIndex(0);
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    if (key === "Escape") {
      close();
      event.currentTarget.blur();
    } else if (key === "ArrowDown" && flat.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((active + 1) % flat.length);
    } else if (key === "ArrowUp" && flat.length) {
      event.preventDefault();
      setActiveIndex((active - 1 + flat.length) % flat.length);
    } else if (key === "Enter" && panelOpen && flat[active]) {
      event.preventDefault();
      const { to } = flat[active];
      finish();
      navigate(to);
    }
  };

  // Plain clicks close the panel; modified ones (new tab) leave it alone.
  const onResultClick = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    finish();
  };

  const group = (label: string, list: Row[], offset: number) =>
    list.length === 0 ? null : (
      <div className="py-1">
        <p aria-hidden className="px-4 pt-2 pb-1 text-xs font-semibold text-subtle">
          {label}
        </p>
        <ul aria-label={label}>
          {list.map((row, i) => {
            const index = offset + i;
            return (
              <li key={row.key}>
                <Link
                  id={`${panelId}-${index}`}
                  to={row.to}
                  onClick={onResultClick}
                  onMouseEnter={() => setActiveIndex(index)}
                  data-active={index === active || undefined}
                  className={cn(
                    "mx-1.5 flex items-center gap-3 rounded-lg px-2.5 py-2",
                    index === active && "bg-surface-2",
                  )}
                >
                  <Thumb row={row} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{row.title}</span>
                    {row.subtitle ? <span className="block truncate text-xs text-muted">{row.subtitle}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className="relative w-full">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        <Search className="size-4 shrink-0 text-subtle" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={PLACEHOLDER}
          aria-expanded={panelOpen}
          aria-controls={panelId}
          aria-autocomplete="list"
          aria-activedescendant={panelOpen && flat.length ? `${panelId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          value={query}
          onChange={onChange}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            // Keep focus in the box so the panel stays open.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <span aria-hidden className="hidden shrink-0 sm:block">
            <Kbd>{IS_MAC ? "⌘K" : "Ctrl K"}</Kbd>
          </span>
        )}
      </div>

      {panelOpen ? (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          id={panelId}
          // Clicking a result must not blur the input first, or the panel would close before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[min(30rem,70vh)] animate-pop-in overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-overlay"
        >
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Searching" />
            </div>
          ) : error ? (
            <p className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-danger" role="alert">
              <span>{errorMessage(error, "Search failed. Try again.")}</span>
              <button
                type="button"
                className="font-medium underline-offset-4 hover:underline"
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </p>
          ) : flat.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">No results for “{trimmed}”.</p>
          ) : (
            <>
              {group("Models", rows?.models ?? [], 0)}
              {group("Collections", rows?.collections ?? [], rows?.models.length ?? 0)}
              {group("Tags", rows?.tags ?? [], (rows?.models.length ?? 0) + (rows?.collections.length ?? 0))}
            </>
          )}
          {isFetching && rows ? <span className="sr-only">Updating results</span> : null}
        </div>
      ) : null}
    </div>
  );
}

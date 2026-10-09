import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Box, User } from "lucide-react";
import { dashboardApi, type DashboardAuthor, type DashboardModel, type DashboardProvider } from "@/api/dashboard";
import { printsApi } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import { printProviderInfo } from "@/constants/importProviders";
import { Alert, Button, Card, CardHeader, Modal, Skeleton } from "@/ui";

const ROW = "flex items-center gap-3 rounded-control px-2 py-1.5 text-sm hover:bg-surface-2";

function Rank({ n }: { n: number }) {
  return <span className="w-5 shrink-0 text-center font-semibold text-muted">{n}</span>;
}

function Thumb({ url, round }: { url: string | null; round?: boolean }) {
  const cls = round ? "rounded-full" : "rounded-control";
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center overflow-hidden bg-surface-2 text-subtle ${cls}`}>
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : round ? <User className="size-4" aria-hidden /> : <Box className="size-4" aria-hidden />}
    </span>
  );
}

export function ModelRow({ model, rank, value, onNavigate }: { model: DashboardModel; rank: number; value: string; onNavigate?: () => void }) {
  return (
    <Link to={`/models/${model.id}`} onClick={onNavigate} className={ROW}>
      <Rank n={rank} />
      <Thumb url={model.thumb_url ? printsApi.fileUrl(model.thumb_url) : null} />
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{model.name}</span>
      <span className="shrink-0 pl-2 text-muted">{value}</span>
    </Link>
  );
}

export function AuthorRow({ author, rank, onNavigate }: { author: DashboardAuthor; rank: number; onNavigate?: () => void }) {
  return (
    <Link to={`/authors/${author.id}`} onClick={onNavigate} className={ROW}>
      <Rank n={rank} />
      <Thumb url={author.avatar_url} round />
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{author.name || author.handle || "—"}</span>
      <span className="shrink-0 pl-2 text-muted">{countLabel(author.model_count, "model")}</span>
    </Link>
  );
}

export const countLabel = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** Fetches lazily, once opened. */
function SeeMore<T>({ title, emptyText, queryKey, fetcher, getKey, renderItem }: {
  title: string;
  emptyText: string;
  queryKey: string;
  fetcher: () => Promise<T[]>;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["dashboard", queryKey], queryFn: fetcher, enabled: open });
  const close = () => setOpen(false);
  return (
    <>
      <Button variant="link" className="mt-2" onClick={() => setOpen(true)}>
        See more
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={title}>
        {query.isError ? (
          <Alert tone="danger" action={<Button size="sm" onClick={() => void query.refetch()}>Retry</Button>}>
            {errorMessage(query.error, "Failed to load.")}
          </Alert>
        ) : !query.data ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={`s${i}`} className="h-10" />
            ))}
          </div>
        ) : query.data.length === 0 ? (
          <p className="py-4 text-sm text-muted">{emptyText}</p>
        ) : (
          <ul>
            {query.data.map((item, index) => (
              <li key={getKey(item)}>{renderItem(item, index, close)}</li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function CardBody({ empty, children }: { empty: string | null; children: ReactNode }) {
  return empty ? <p className="py-2 text-sm text-muted">{empty}</p> : <ul>{children}</ul>;
}

type ModelCardProps = {
  icon: ReactNode;
  title: string;
  models: DashboardModel[];
  valueOf: (model: DashboardModel) => string;
  emptyText: string;
  queryKey: string;
  fetchMore: () => Promise<DashboardModel[]>;
};

export function ModelListCard({ icon, title, models, valueOf, emptyText, queryKey, fetchMore }: ModelCardProps) {
  return (
    <Card padding="lg">
      <CardHeader title={title} icon={icon} />
      <CardBody empty={models.length === 0 ? emptyText : null}>
        {models.map((m, i) => (
          <li key={m.id}>
            <ModelRow model={m} rank={i + 1} value={valueOf(m)} />
          </li>
        ))}
      </CardBody>
      <SeeMore
        title={title}
        emptyText={emptyText}
        queryKey={queryKey}
        fetcher={fetchMore}
        getKey={(m) => m.id}
        renderItem={(m, i, close) => <ModelRow model={m} rank={i + 1} value={valueOf(m)} onNavigate={close} />}
      />
    </Card>
  );
}

export function AuthorListCard({ authors, icon }: { authors: DashboardAuthor[]; icon: ReactNode }) {
  const empty = "No authors yet. Import a model to see your top authors here.";
  return (
    <Card padding="lg">
      <CardHeader title="Top Authors" icon={icon} />
      <CardBody empty={authors.length === 0 ? empty : null}>
        {authors.map((a, i) => (
          <li key={a.id}>
            <AuthorRow author={a} rank={i + 1} />
          </li>
        ))}
      </CardBody>
      <SeeMore
        title="Top Authors"
        emptyText={empty}
        queryKey="top-authors"
        fetcher={dashboardApi.getTopAuthors}
        getKey={(a) => a.id}
        renderItem={(a, i, close) => <AuthorRow author={a} rank={i + 1} onNavigate={close} />}
      />
    </Card>
  );
}

/** A small fixed set, so no "See more" and no links. */
export function ProviderListCard({ providers, icon }: { providers: DashboardProvider[]; icon: ReactNode }) {
  return (
    <Card padding="lg">
      <CardHeader title="Top Providers" icon={icon} />
      <CardBody empty={providers.length === 0 ? "No models yet." : null}>
        {providers.map((p) => {
          const info = printProviderInfo(p.provider);
          return (
            <li key={p.provider} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
              <span
                className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: info.color, color: info.textColor ?? "#fff" }}
              >
                {info.label}
              </span>
              <span className="shrink-0 text-muted">{countLabel(p.model_count, "model")}</span>
            </li>
          );
        })}
      </CardBody>
    </Card>
  );
}

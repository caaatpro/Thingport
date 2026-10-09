import type { ReactNode } from "react";
import { Box } from "lucide-react";
import { Link } from "react-router-dom";
import { printsApi } from "@/api/prints";
import type { DashboardModel } from "@/api/dashboard";

type Props = {
  icon: ReactNode;
  title: string;
  models: DashboardModel[];
  /** Shown instead of the tiles when there is nothing to list. Without it an empty shelf is hidden. */
  emptyText?: string;
  /** Optional second line under each name, e.g. "3 days ago". */
  caption?: (model: DashboardModel) => string;
};

/** A row of thumbnail tiles; each is a real link to its model. */
export function Shelf({ icon, title, models, emptyText, caption }: Props) {
  if (models.length === 0 && !emptyText) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight text-fg">
        <span className="text-accent-text [&>svg]:size-5">{icon}</span>
        {title}
      </h2>
      {models.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {models.map((model) => (
            <li key={model.id}>
              <Link
                to={`/models/${model.id}`}
                className="block overflow-hidden rounded-card border border-border bg-surface shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-hover"
              >
                <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 text-subtle">
                  {model.thumb_url ? (
                    <img
                      src={printsApi.fileUrl(model.thumb_url)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Box className="size-8" aria-hidden />
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-fg" title={model.name}>
                    {model.name}
                  </p>
                  {caption ? <p className="truncate text-xs text-muted">{caption(model)}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

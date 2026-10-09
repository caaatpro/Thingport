import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, TriangleAlert, X } from "lucide-react";
import { Button, IconButton } from "@/ui";
import { useImportJobs } from "./ImportJobsProvider";
import { jobBreakdown, jobCompletionMessage, jobProgressPercent, jobResultLink, jobTitle } from "./logic";

/** A slim panel for the running background import (and its outcome afterwards). Renders nothing when idle. */
export function ImportProgress() {
  const { activeJob, finishedJob, dismissFinished } = useImportJobs();

  if (activeJob) {
    const percent = jobProgressPercent(activeJob);
    const label = percent === null ? "Starting import…" : `Importing… ${activeJob.processed} of ${activeJob.total}`;
    const breakdown = jobBreakdown(activeJob);
    return (
      <section
        aria-label="Import progress"
        className="fixed bottom-4 left-4 z-[60] w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-3 shadow-overlay"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-fg">
          <Loader2 className="size-4 shrink-0 animate-spin text-accent-text" aria-hidden />
          <output className="min-w-0 flex-1 truncate">{label}</output>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted" title={activeJob.source_url}>
          {jobTitle(activeJob)}
        </p>
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={
              percent === null
                ? "h-full w-1/3 animate-pulse rounded-full bg-accent"
                : "h-full rounded-full bg-accent transition-[width]"
            }
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        {breakdown ? <p className="mt-1.5 text-xs text-muted">{breakdown}</p> : null}
      </section>
    );
  }

  if (finishedJob) {
    const { tone, message } = jobCompletionMessage(finishedJob);
    const link = jobResultLink(finishedJob);
    const Icon = tone === "success" ? CheckCircle2 : TriangleAlert;
    return (
      <section
        aria-label="Import result"
        className="fixed bottom-4 left-4 z-[60] w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-3 shadow-overlay"
      >
        <div className="flex items-start gap-2 text-sm text-fg">
          <Icon
            className={
              tone === "success"
                ? "mt-0.5 size-4 shrink-0 text-success"
                : tone === "warning"
                  ? "mt-0.5 size-4 shrink-0 text-warning"
                  : "mt-0.5 size-4 shrink-0 text-danger"
            }
            aria-hidden
          />
          <p className="min-w-0 flex-1 break-words">{message}</p>
          <IconButton label="Dismiss" size="sm" onClick={dismissFinished} className="-mt-1 -mr-1">
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
        {link ? (
          <Button asChild variant="secondary" size="sm" className="mt-2">
            <Link to={link.to} onClick={dismissFinished}>
              {link.label}
            </Link>
          </Button>
        ) : null}
      </section>
    );
  }

  return null;
}

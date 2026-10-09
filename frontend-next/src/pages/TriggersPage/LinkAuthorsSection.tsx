import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { adminApi, type AuthorLinkingStatus, type AuthorLookupProblem } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button } from "@/ui";
import { AdminSection } from "../AdminPage/parts";

const POLL_MS = 2000;
const KEY = ["admin", "link-authors"] as const;

const PROBLEMS: Record<AuthorLookupProblem, string> = {
  thingiverse_no_token: "Thingiverse models were skipped: add a Thingiverse access token in Administration > Settings.",
  thingiverse_token_rejected: "Thingiverse models were skipped: Thingiverse rejected the access token in Administration > Settings.",
  makerworld_captcha:
    "MakerWorld models were skipped: MakerWorld asked for a CAPTCHA, and blocks further requests for about 2 hours. Try again later.",
  makerworld_login_rejected: "MakerWorld models were skipped: MakerWorld rejected the saved MakerWorld login. Update it in Settings > Imports.",
};

/** Links name-only models to authors across the instance, looking authors up on their site where
 *  needed. Shown only while there's something to link or report. */
export default function LinkAuthorsSection() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: KEY,
    queryFn: () => adminApi.getAuthorLinking(),
    refetchInterval: (q) => (q.state.data?.run?.running ? POLL_MS : false),
  });
  const start = useMutation({
    mutationFn: () => adminApi.startAuthorLinking(),
    onSuccess: ({ run }) => {
      queryClient.setQueryData<AuthorLinkingStatus>(KEY, (prev) => (prev ? { ...prev, run } : prev));
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const data = status.data;
  if (!data) return null;
  const { linkable, lookup, run } = data;
  if (!linkable && !lookup && !run) return null;

  const pending = [
    linkable > 0 ? `${linkable} model(s) can be linked right away.` : null,
    lookup > 0 ? `${lookup} model(s) need their author looked up.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AdminSection
      title="Link missing authors"
      description="Some imported models show their author only as a name, without the author's profile, avatar or link, because the import couldn't fetch the author at the time. This links each of them to their author: to an author already in Thingport with exactly that name from the same site, or else by looking the author up on the site the model came from. Only details are fetched, never files. It runs for the whole instance, across every user's models, in the background. MakerWorld lookups are spaced out to avoid its CAPTCHA, so they can take a few minutes."
    >
      <div className="flex flex-col gap-3">
        {run?.running ? (
          <div className="space-y-2">
            <p className="text-sm text-fg">
              Looking up authors: {run.lookedUp} of {run.toLookUp} — {run.linked} model(s) linked so far.
            </p>
            <progress
              className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-accent"
              {...(run.toLookUp ? { value: run.lookedUp, max: run.toLookUp } : {})}
              aria-label="Author lookup progress"
            />
          </div>
        ) : linkable > 0 || lookup > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Link2 className="size-4" />} loading={start.isPending} onClick={() => start.mutate()}>
              Link missing authors
            </Button>
            <span className="text-sm text-muted">{pending}</span>
          </div>
        ) : null}

        {run && !run.running ? (
          <Alert tone={run.linked > 0 ? "success" : "info"}>
            Linked {run.linked} model(s) to their author.
            {run.notFound > 0
              ? ` The author couldn't be found for ${run.notFound} creator(s). The model may have been removed from its site, or the site couldn't be reached.`
              : ""}
          </Alert>
        ) : null}
        {run?.problems.map((problem) => (
          <Alert key={problem} tone="warning">
            {PROBLEMS[problem]}
          </Alert>
        ))}
        {start.error ? <Alert tone="danger">{errorMessage(start.error, "Failed to link authors.")}</Alert> : null}
      </div>
    </AdminSection>
  );
}

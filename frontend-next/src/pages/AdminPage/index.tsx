import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, ChevronRight, History, RefreshCw, Settings, Users, Zap, Box } from "lucide-react";
import { adminApi, type AdminOverview } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Button, Card, PageHeader, Skeleton, cn, useToast } from "@/ui";
import { formatFileSize } from "@/utils/fileSize";

type Section = { path: string; icon: ReactNode; label: string; description: string };

const SECTIONS: Section[] = [
  { path: "/admin-users", icon: <Users />, label: "Users", description: "Accounts, roles, access and invitations" },
  {
    path: "/admin-settings",
    icon: <Settings />,
    label: "Settings",
    description: "Storage layout, Thingiverse access and session length",
  },
  { path: "/admin-rendering", icon: <Box />, label: "Rendering", description: "How 3D previews are generated" },
  { path: "/admin-logs", icon: <History />, label: "Logs", description: "Who did what, and when" },
  { path: "/admin-triggers", icon: <Zap />, label: "Triggers", description: "One-off maintenance jobs" },
  {
    path: "/admin-connections",
    icon: <Cable />,
    label: "Connections",
    description: "Email delivery and the database connection",
  },
];

function StatCard({
  title,
  value,
  lines,
  action,
  href,
  warn,
}: {
  title: string;
  value: ReactNode;
  lines: string[];
  action?: ReactNode;
  /** Makes the whole card a link (via the title). */
  href?: string;
  warn?: boolean;
}) {
  return (
    <Card
      interactive={Boolean(href)}
      className={cn("relative min-w-0", warn && "border-warning/60")}
      padding="md"
    >
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {href ? (
          <Link to={href} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none">
            {title}
          </Link>
        ) : (
          title
        )}
      </p>
      <p className="mt-1 mb-2 text-2xl font-bold tracking-tight text-fg tabular-nums">{value}</p>
      <ul className="space-y-0.5 text-sm text-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {action ? <div className="relative mt-3">{action}</div> : null}
    </Card>
  );
}

function StatSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 rounded-card" />
      ))}
    </div>
  );
}

function Overview({ overview }: { overview: AdminOverview }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const retry = useMutation({
    mutationFn: () => adminApi.retryFailedProcessing(),
    onSuccess: async (res) => {
      toast.success(`Retrying ${res.retried} failed items.`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't retry. Try again.")),
  });

  const { users, library, processing, imports } = overview;
  const busy = processing.queued + processing.processing;
  const failed = processing.failed;
  const idle = busy + failed === 0;

  const userLines = [
    `${users.active_7d} active this week`,
    ...(users.disabled > 0 ? [`${users.disabled} disabled`] : []),
    ...(users.pending_invitations > 0 ? [`${users.pending_invitations} pending invitations`] : []),
  ];
  const backgroundLines = [
    idle && imports.running === 0 ? "Nothing running" : "",
    busy > 0 ? `${busy} processing` : "",
    failed > 0 ? `${failed} failed` : "",
    imports.running > 0 ? `${imports.running} imports running` : "",
    imports.failed_24h > 0 ? `${imports.failed_24h} imports failed in 24 h` : "",
  ].filter(Boolean);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard title="Users" value={users.total} href="/admin-users" lines={userLines} />
      <StatCard
        title="Library"
        value={formatFileSize(library.model_bytes) || "0 B"}
        lines={[`${library.models} models`, `${library.collections} collections`]}
      />
      <StatCard
        title="Background work"
        value={idle ? "✓" : busy}
        warn={failed > 0 || imports.failed_24h > 0}
        lines={backgroundLines}
        action={
          failed > 0 ? (
            <Button size="sm" icon={<RefreshCw className="size-4" />} loading={retry.isPending} onClick={() => retry.mutate()}>
              Retry failed
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/** The administration home: a live summary, then a tile for every section. */
export default function AdminPage() {
  const overviewQuery = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminApi.getOverview() });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Administration" subtitle="Accounts, settings and maintenance for this instance." />
      <div className="space-y-6">
        {overviewQuery.isPending ? <StatSkeleton /> : null}
        {/* A failed overview just hides the cards: the section links below still work. */}
        {overviewQuery.data ? <Overview overview={overviewQuery.data} /> : null}

        <nav aria-label="Administration sections">
          <ul className="grid gap-3 md:grid-cols-2">
            {SECTIONS.map((section) => (
              <li key={section.path}>
                <Link
                  to={section.path}
                  className="group flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-hover"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-text [&>svg]:size-5">
                    {section.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">{section.label}</span>
                    <span className="block text-xs text-muted">{section.description}</span>
                  </span>
                  <ChevronRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

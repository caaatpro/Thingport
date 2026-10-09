import { useQuery } from "@tanstack/react-query";
import { Eye, Folder, FolderOpen, Globe, History, Printer, Sparkles, Star, User, Box } from "lucide-react";
import { dashboardApi } from "@/api/dashboard";
import { Alert, Button, PageHeader, Skeleton } from "@/ui";
import { AuthorListCard, countLabel, ModelListCard, ProviderListCard } from "./ListCards";
import { Shelf } from "./Shelf";
import { StatTile } from "./StatTile";
import { relativeTime } from "./relativeTime";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={`t${i}`} className="h-[88px] rounded-card" />
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={`m${i}`} className="aspect-[4/3] rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={`c${i}`} className="h-64 rounded-card" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const query = useQuery({ queryKey: ["dashboard", "summary"], queryFn: () => dashboardApi.getSummary() });
  const summary = query.data;

  return (
    <>
      <PageHeader title="Dashboard" />
      {query.isError ? (
        <Alert tone="danger" action={<Button size="sm" onClick={() => void query.refetch()}>Retry</Button>}>
          Failed to load your dashboard.
        </Alert>
      ) : !summary ? (
        <DashboardSkeleton />
      ) : (
        <div className="flex flex-col gap-8">
          <div aria-label="Library at a glance" className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
            <StatTile icon={<Box />} count={summary.model_count} label="Models" to="/models" />
            <StatTile icon={<FolderOpen />} count={summary.collection_count} label="Collections" to="/models/collections" />
            <StatTile icon={<User />} count={summary.author_count} label="Unique authors" />
            <StatTile icon={<Folder />} count={summary.category_count} label="Categories" to="/models" />
          </div>

          <Shelf icon={<History />} title="Pick up where you left off" models={summary.recently_viewed} />
          <Shelf
            icon={<Sparkles />}
            title="Recently Added"
            models={summary.recently_added}
            emptyText="Nothing added yet. Uploaded and imported models will show up here."
            caption={(m) => relativeTime(m.created_at)}
          />
          <Shelf icon={<Star />} title="Favorites" models={summary.favorites} />

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <ModelListCard
              icon={<Eye />}
              title="Top Viewed Models"
              models={summary.top_viewed}
              valueOf={(m) => countLabel(m.view_count, "view")}
              emptyText="Nothing viewed yet. Models you open will show up here."
              queryKey="top-viewed"
              fetchMore={dashboardApi.getTopViewed}
            />
            <ModelListCard
              icon={<Printer />}
              title="Top Printed Models"
              models={summary.top_printed}
              valueOf={(m) => countLabel(m.print_count, "print")}
              emptyText="Nothing printed yet. Models you download or open in a slicer will show up here."
              queryKey="top-printed"
              fetchMore={dashboardApi.getTopPrinted}
            />
            <div className="flex flex-col gap-4">
              <AuthorListCard authors={summary.top_authors} icon={<User />} />
              <ProviderListCard providers={summary.top_providers} icon={<Globe />} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

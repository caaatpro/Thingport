import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Share2 } from "lucide-react";
import { printsApi } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import { FavoriteButton, ModelActionsMenu, TagBadge, VisibilityBadge } from "@/features/prints";
import { Alert, Button, Card, PageHeader, Skeleton } from "@/ui";
import { hasRole } from "@/utils/access";
import EditModelModal from "./EditModelModal";
import { ModelFilesPanel } from "./ModelFilesPanel";
import { ModelGallery } from "./ModelGallery";
import { ModelSidePanel } from "./ModelSidePanel";

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="grid grid-cols-1 items-start gap-6 md:grid-cols-[2fr_1fr]">
      <div className="flex min-w-0 flex-col gap-6">
        <Skeleton className="aspect-[16/10] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

/** `/models/:printId`. `?edit=<id>` opens the edit dialog, so editing is a link and survives a reload. */
export default function ModelDetailPage() {
  const { printId = "" } = useParams<{ printId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  // The API counts a view on every GET, so don't refetch on window focus (the query client already doesn't).
  const query = useQuery({ queryKey: ["print", printId], queryFn: () => printsApi.get(printId), enabled: Boolean(printId) });
  const print = query.data;

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1390px]">
        <PageHeader title="Model" backTo="/models" />
        <DetailSkeleton />
      </div>
    );
  }
  if (query.isError || !print) {
    return (
      <div className="mx-auto w-full max-w-[1390px]">
        <PageHeader title="Model" backTo="/models" />
        <Alert
          tone="danger"
          title="Couldn't load this model"
          action={
            <Button size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(query.error, "It may have been deleted, or you may not have access.")}
        </Alert>
      </div>
    );
  }

  const title = print.title || print.name;
  const isOwner = print.is_owner !== false;
  const canEdit = hasRole(print.access_role, "edit");
  const editing = searchParams.get("edit") === print.id && canEdit;
  const closeEdit = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("edit");
        return next;
      },
      { replace: true },
    );

  return (
    <div className="mx-auto w-full max-w-[1390px]">
      <PageHeader
        title={title}
        backTo="/models"
        subtitle={
          isOwner && print.visibility !== "shared" ? undefined : (
            <VisibilityBadge visibility={print.visibility} ownerName={isOwner ? null : print.owner?.display_name} />
          )
        }
        actions={
          <>
            <FavoriteButton print={print} />
            {canEdit ? (
              <Button asChild size="sm">
                <Link to={`/models/${print.id}?edit=${print.id}`}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}
            {isOwner ? (
              <Button size="sm" icon={<Share2 className="size-4" aria-hidden />} onClick={() => setShareOpen(true)}>
                Share…
              </Button>
            ) : null}
            <ModelActionsMenu print={print} onDeleted={() => navigate("/models")} shareOpen={shareOpen} onShareOpenChange={setShareOpen} />
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <ModelGallery key={print.id} print={print} />
          <ModelFilesPanel print={print} />
          <Card padding="lg">
            <h2 className="mb-2 text-sm font-semibold text-fg">Description</h2>
            {print.notes ? <p className="text-sm break-words whitespace-pre-wrap text-fg">{print.notes}</p> : <p className="text-sm text-subtle">No description yet.</p>}
            <h2 className="mt-5 mb-2 text-sm font-semibold text-fg">Tags</h2>
            {print.tags.length ? (
              <ul className="flex flex-wrap gap-2">
                {print.tags.map((tag) => (
                  <li key={tag}>
                    <Link to={`/models/tags/${encodeURIComponent(tag)}`} className="rounded-full">
                      <TagBadge tag={tag} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No tags yet.</p>
            )}
          </Card>
        </div>
        {/* Stretched to the left column's height, so the sticky panel inside has room to travel. */}
        <div className="self-stretch">
          <ModelSidePanel print={print} />
        </div>
      </div>

      {editing ? <EditModelModal key={print.id} print={print} onClose={closeEdit} /> : null}
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Download, ExternalLink, Eye, Folder, HardDrive, Printer, Rocket } from "lucide-react";
import type { Print } from "@/api/prints";
import { useAuth } from "@/app/auth";
import { importProviderInfo } from "@/constants/importProviders";
import {
  AuthorHoverCard,
  DownloadPickerDialog,
  NormalizedOpenButton,
  RollingNumber,
  SlicerFileDialog,
  useDownloadPrint,
  useNormalizedOpen,
  useOpenInSlicer,
} from "@/features/prints";
import { authorDisplay } from "@/features/prints/authorDisplay";
import { Avatar, Button, Card, Tip } from "@/ui";
import { formatFileSize } from "@/utils/fileSize";
import { useGravatarUrl } from "@/hooks/useGravatarUrl";
import { preparedSummary } from "./preparedInfo";

/** The link as shown: no scheme, no "www.". */
export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      {children}
    </div>
  );
}

/** The detail page's sticky summary card: who, where from, how big, and the ways to get the files. */
export function ModelSidePanel({ print }: { print: Print }) {
  const { user: viewer } = useAuth();
  const viewerAvatar = useGravatarUrl(viewer?.email, 56);
  const download = useDownloadPrint(print);
  const { slicerOption, targets, normalizedTargets } = useOpenInSlicer(print);
  const normalized = useNormalizedOpen(print.id, download.recordUse);
  const [slicerPickerOpen, setSlicerPickerOpen] = useState(false);

  const author = authorDisplay(print, viewer);
  const avatarUrl = author.avatarUrl || (author.showViewerAsAuthor ? viewerAvatar : undefined);
  const provider = importProviderInfo(print.source_provider);
  const sourceUrl = provider && print.source_url ? print.source_url : null;
  const date = new Date(print.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const prepared = preparedSummary(print.prepared_print);

  const authorBody = (
    <>
      <Avatar src={avatarUrl} name={author.name} size={28} />
      <span className="text-sm">{author.name || "Unknown author"}</span>
    </>
  );

  return (
    <Card padding="lg" className="md:sticky md:top-20">
      <div className="flex flex-col gap-4">
        <Block label="Title">
          <p className="text-sm break-words text-fg">{print.title || print.name}</p>
        </Block>

        <Block label="Author">
          <AuthorHoverCard authorId={author.authorId} disabled={!author.hoverEnabled}>
            {author.link ? (
              <Link to={author.link} className="flex w-fit items-center gap-2 text-fg hover:text-accent-text">
                {authorBody}
              </Link>
            ) : (
              <span className="flex w-fit items-center gap-2 text-fg">{authorBody}</span>
            )}
          </AuthorHoverCard>
        </Block>

        {sourceUrl ? (
          <Block label="Source">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm break-all text-accent-text hover:underline"
            >
              {shortUrl(sourceUrl)}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          </Block>
        ) : null}

        {print.category_id && print.category_name ? (
          <Block label="Category">
            <Link
              to={`/models?category=${print.category_id}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg hover:text-accent-text"
            >
              <Folder className="size-4" aria-hidden />
              {print.category_name}
            </Link>
          </Block>
        ) : null}

        {typeof print.total_size === "number" ? (
          <Block label="Size">
            <Tip content="Total size of all this model's files in storage">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
                <HardDrive className="size-4" aria-hidden />
                {formatFileSize(print.total_size)}
              </p>
            </Tip>
          </Block>
        ) : null}

        {slicerOption && targets.length > 0 ? (
          targets.length === 1 ? (
            <Button asChild className="w-full border-accent text-accent-text">
              <a href={targets[0]?.href} onClick={download.recordUse}>
                <Rocket className="size-4" aria-hidden />
                {`Open in ${slicerOption.label}`}
              </a>
            </Button>
          ) : (
            <>
              <Button
                className="w-full border-accent text-accent-text"
                icon={<Rocket className="size-4" aria-hidden />}
                onClick={() => setSlicerPickerOpen(true)}
              >
                {`Open in ${slicerOption.label}`}
                <ChevronDown className="size-4" aria-hidden />
              </Button>
              <SlicerFileDialog
                open={slicerPickerOpen}
                onOpenChange={setSlicerPickerOpen}
                slicerLabel={slicerOption.label}
                targets={targets}
                onOpen={download.recordUse}
              />
            </>
          )
        ) : null}
        {slicerOption && normalizedTargets.length > 0 ? (
          <NormalizedOpenButton
            targets={normalizedTargets}
            slicerLabel={slicerOption.label}
            stateOf={normalized.stateOf}
            open={normalized.open}
            onOpened={download.recordUse}
          />
        ) : null}
        {slicerOption && prepared ? <p className="-mt-2 text-xs text-muted">{`Prepared print: ${prepared}`}</p> : null}

        <Button
          variant="primary"
          className="w-full"
          onClick={download.handleDownload}
          loading={download.downloading}
          icon={<Download className="size-4" aria-hidden />}
        >
          Download model files
        </Button>

        <div className="flex gap-3">
          <div
            title="Views"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-border py-2 text-sm font-semibold text-fg"
          >
            <Eye className="size-4 text-muted" aria-hidden />
            <span className="sr-only">Views: </span>
            {print.view_count}
          </div>
          <div
            title="Prints"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-border py-2 text-sm font-semibold text-fg"
          >
            <Printer className="size-4 text-muted" aria-hidden />
            <span className="sr-only">Prints: </span>
            <RollingNumber value={print.print_count} />
          </div>
        </div>

        <p className="text-right text-xs text-muted">{print.source_provider ? `Imported ${date}` : `Added ${date}`}</p>
      </div>

      <DownloadPickerDialog
        open={download.pickerOpen}
        onOpenChange={download.setPickerOpen}
        downloading={download.downloading}
        sortedPlates={download.sortedPlates}
        downloadAllZip={download.downloadAllZip}
        downloadPlate={download.downloadPlate}
      />
    </Card>
  );
}

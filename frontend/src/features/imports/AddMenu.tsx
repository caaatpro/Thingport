import { lazy, Suspense, useState } from "react";
import { Link as LinkIcon, Plus, Upload } from "lucide-react";
import { Button, Menu, MenuItem } from "@/ui";
import { useImportJobs } from "./ImportJobsProvider";
import { useUploadImport } from "./useUploadImport";

const ImportLinkDialog = lazy(() => import("./ImportLinkDialog"));

/**
 * The top bar's "Add" button: upload files and import from a link. Uploads land in the category or
 * collection the URL points at.
 */
export function AddMenu() {
  const upload = useUploadImport();
  const { isImporting } = useImportJobs();
  const [linkOpen, setLinkOpen] = useState(false);
  // Bumped on every open so the dialog starts fresh (empty link, no stale error).
  const [linkSession, setLinkSession] = useState(0);

  const openLink = () => {
    setLinkSession((n) => n + 1);
    setLinkOpen(true);
  };

  return (
    <>
      {upload.fileInput}
      <Menu
        trigger={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="size-4" aria-hidden />}
            loading={upload.uploading}
            disabled={upload.isBusy && !upload.uploading}
          >
            {upload.uploading ? "Uploading…" : "Add"}
          </Button>
        }
      >
        <MenuItem icon={<Upload />} onSelect={upload.triggerUpload}>
          Upload
        </MenuItem>
        <MenuItem
          icon={<LinkIcon />}
          disabled={isImporting}
          onSelect={openLink}
          hint={isImporting ? "Import running" : undefined}
        >
          Import from link…
        </MenuItem>
      </Menu>

      {linkSession > 0 ? (
        <Suspense fallback={null}>
          <ImportLinkDialog
            key={linkSession}
            open={linkOpen}
            onOpenChange={setLinkOpen}
            importing={upload.importing}
            onSubmit={(url, scope, onPrompt) => upload.submitImport(url, scope, onPrompt)}
          />
        </Suspense>
      ) : null}
      {upload.modals}
    </>
  );
}

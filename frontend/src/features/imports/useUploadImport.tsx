import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UnauthorizedError } from "@/api/client";
import { importsApi, type ImportOutcome, type MakerworldProfileScope } from "@/api/imports";
import { printsApi, type Print } from "@/api/prints";
import { useAuth } from "@/app/auth";
import { useMakerWorldCookie } from "@/app/preferences";
import { errorMessage } from "@/app/queryClient";
import { useToast } from "@/ui";
import {
  isMakerworldCollectionUrl,
  isMakerworldModelUrl,
  isPrintablesCollectionUrl,
  isPrintablesModelUrl,
  isThingiverseCollectionUrl,
  isThingiverseLikesUrl,
  isThingiverseThingUrl,
} from "@/utils/importLinkDetection";
import { entriesFromFileList, uploadEntriesToCategory, type UploadEntry } from "@/utils/uploadTree";
import { buildUploadEntriesFromZip, readZipEntries } from "@/utils/zipUtils";
import { useImportJobs } from "./ImportJobsProvider";
import { useInvalidateLibrary } from "./invalidate";
import { isFlatFileSet, splitZips } from "./logic";
import { usePrompts } from "./usePrompts";
import { useImportTarget } from "./useImportTarget";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.stl,.step,.stp,.3mf,.obj,.f3d,.f3z,.lbrn,.lbrn2,.zip";

type UploadResult = { uploaded: number; failed: string[]; prints: Print[] };

/**
 * Everything the "Add" menu does: pick files, upload them (with the separate/multiplate and ZIP prompts), and
 * import from a link. Render `fileInput` and `modals` once next to the menu.
 */
export function useUploadImport() {
  const { categoryId } = useImportTarget();
  const [makerworldCookie] = useMakerWorldCookie();
  const { onUnauthorized } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidateLibrary = useInvalidateLibrary();
  const prompts = usePrompts();
  const jobs = useImportJobs();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);

  const isBusy = uploading || importing || prompts.isOpen;

  const uploadFlatAsMultiplate = async (files: File[]): Promise<UploadResult> => {
    try {
      const result = await printsApi.upload(files, { category_id: categoryId || undefined, mode: "multiplate" });
      return { uploaded: result.prints.length, failed: [], prints: result.prints };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return { uploaded: 0, failed: [], prints: [] };
      }
      const message = err instanceof Error ? err.message.trim() : "";
      return { uploaded: 0, failed: [message ? `Multi-file import (${message})` : "Multi-file import"], prints: [] };
    }
  };

  const uploadToCategory = (entries: UploadEntry[]) => uploadEntriesToCategory(entries, categoryId || null, onUnauthorized);

  const uploadEntries = async (entries: UploadEntry[]) => {
    if (!entries.length) return;
    setUploading(true);
    try {
      const { normal, zips } = splitZips(entries);
      let uploaded = 0;
      const failed: string[] = [];
      const prints: Print[] = [];
      const apply = (result: UploadResult) => {
        uploaded += result.uploaded;
        failed.push(...result.failed);
        prints.push(...result.prints);
      };

      if (normal.length) {
        if (isFlatFileSet(normal)) {
          await prompts.ask.mode({
            label: normal.map((entry) => entry.file.name).join(", "),
            count: normal.length,
            onChoose: async (mode) => {
              apply(mode === "multiplate" ? await uploadFlatAsMultiplate(normal.map((e) => e.file)) : await uploadToCategory(normal));
            },
          });
        } else {
          apply(await uploadToCategory(normal));
        }
      }

      for (const entry of zips) {
        let zipData: Record<string, Uint8Array> | null = null;
        const baseParts = entry.relativePath.split("/").filter(Boolean);
        baseParts.pop();
        const basePath = baseParts.join("/");
        await prompts.ask.zip({
          label: entry.file.name,
          onImportAsZip: async () => apply(await uploadToCategory([entry])),
          loadEntries: async () => {
            const result = await readZipEntries(entry.file);
            zipData = result.data;
            return result.entries;
          },
          onImportSelected: async (selectedPaths) => {
            if (!zipData) zipData = (await readZipEntries(entry.file)).data;
            apply(await uploadToCategory(buildUploadEntriesFromZip(zipData, selectedPaths, basePath)));
          },
        });
      }

      if (uploaded) {
        void invalidateLibrary();
        if (uploaded === 1 && prints.length === 1) {
          toast.success(`Uploaded "${prints[0].title || prints[0].name}"`);
          // A plain upload has no metadata yet, so open it straight in edit mode.
          navigate(`/models/${prints[0].id}?edit=${prints[0].id}`);
        } else {
          toast.success(`Uploaded ${uploaded} models`);
        }
      }
      if (failed.length) toast.error(`Failed to upload: ${failed.join(", ")}`);
    } finally {
      setUploading(false);
    }
  };

  const onFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const entries = entriesFromFileList(input.files || []);
    // Reset first so picking the same file again still fires `change`.
    const picked = entries.slice();
    input.value = "";
    if (picked.length) await uploadEntries(picked);
  };

  const triggerUpload = () => inputRef.current?.click();

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      onChange={(e) => void onFilePick(e)}
      multiple
      accept={ACCEPT}
      hidden
      aria-hidden
      tabIndex={-1}
      data-testid="add-upload-input"
    />
  );

  const afterSingleImport = (imported: Print & { import_outcome?: ImportOutcome }) => {
    const name = imported.title || imported.name;
    if (imported.import_outcome === "profile_added") toast.success(`Added a print profile to "${name}"`);
    else if (imported.import_outcome === "already_imported") toast.info(`"${name}" is already in your library`);
    else toast.success(`Imported "${name}"`);
    void invalidateLibrary();
    navigate(`/models/${imported.id}`);
  };

  /**
   * Imports a pasted link. `onPrompt` is called right before a picker dialog opens so the link dialog can step
   * aside. Throws an `Error` for failures the caller should show; resolves when the flow ends.
   */
  const submitImport = async (rawUrl: string, profileScope: MakerworldProfileScope = "url", onPrompt?: () => void) => {
    const url = rawUrl.trim();
    if (!url) return;
    if (isMakerworldCollectionUrl(url)) {
      throw new Error("MakerWorld collections can only be imported with the Thingport Grab browser extension.");
    }
    setImporting(true);
    try {
      const cookie = makerworldCookie.trim();
      const payload = { url, category_id: categoryId || undefined, makerworld_cookie: cookie || undefined };
      const guard = async <T,>(fn: () => Promise<T>): Promise<T> => {
        try {
          return await fn();
        } catch (err) {
          if (err instanceof UnauthorizedError) onUnauthorized();
          throw err;
        }
      };
      const pickEntries = async (
        load: () => ReturnType<typeof importsApi.listPrintablesCollectionEntries>,
        start: (ids: string[]) => Promise<void>,
      ) => {
        onPrompt?.();
        setImporting(false);
        await prompts.ask.collection({ label: url, loadEntries: () => guard(load), onImportSelected: (ids) => guard(() => start(ids)) });
      };

      if (profileScope !== "url" && isMakerworldModelUrl(url)) {
        await jobs.startMakerworldProfilesImport({ ...payload, scope: profileScope });
        return;
      }
      if (isThingiverseLikesUrl(url)) {
        await pickEntries(
          () => importsApi.listThingiverseLikesEntries(payload),
          (ids) => jobs.startThingiverseLikesImport({ ...payload, thing_ids: ids }),
        );
        return;
      }
      if (isThingiverseCollectionUrl(url)) {
        await pickEntries(
          () => importsApi.listThingiverseCollectionEntries(payload),
          (ids) => jobs.startThingiverseCollectionImport({ ...payload, thing_ids: ids }),
        );
        return;
      }
      if (isPrintablesCollectionUrl(url)) {
        await pickEntries(
          () => importsApi.listPrintablesCollectionEntries(payload),
          (ids) => jobs.startPrintablesCollectionImport({ ...payload, model_ids: ids }),
        );
        return;
      }
      if (isThingiverseThingUrl(url) || isPrintablesModelUrl(url)) {
        // The backend splits these into plates itself.
        afterSingleImport(await guard(() => importsApi.fromLink(payload)));
        return;
      }

      const inspect = await guard(() => importsApi.inspectLink(payload));
      if (!inspect.is_zip) {
        afterSingleImport(await guard(() => importsApi.fromLink(payload)));
        return;
      }
      onPrompt?.();
      setImporting(false);
      await prompts.ask.zip({
        label: inspect.filename,
        onImportAsZip: async () => afterSingleImport(await guard(() => importsApi.fromLink(payload))),
        loadEntries: async () => (await guard(() => importsApi.listZipEntries(payload))).entries.map((e) => ({ path: e.path, size: e.size })),
        onImportSelected: (entries) => guard(() => jobs.startZipImport({ ...payload, entries })),
      });
    } catch (err) {
      // 401s already signed the user out; there's nothing useful to show.
      if (err instanceof UnauthorizedError) return;
      throw new Error(errorMessage(err, "Import failed. Check the link and try again."), { cause: err });
    } finally {
      setImporting(false);
    }
  };

  return {
    fileInput,
    uploading,
    importing,
    isBusy,
    triggerUpload,
    submitImport,
    modals: prompts.modal,
  };
}

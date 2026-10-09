import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Checkbox, Field, Input, Tip, useToast } from "@/ui";
import { formatFileSize } from "@/utils/fileSize";
import { AdminSection, LoadError } from "../AdminPage/parts";
import { addToken, renderExamples } from "./helpers";

const TOKEN_HELP: Record<string, string> = {
  category: "The model's category, with parent categories as parent folders",
  collection:
    'The collection the model is in. Models in no collection go to "Uncollected", models in several go to "Multiple collections"',
  tags: 'The model\'s tags, joined with " + "',
  creator: "The author shown on the model page; a user's own uploads use their display name",
  model: "The model's name",
  filename: "The file's name (required, in the last folder)",
  id: "The model's permanent ID",
  plate: "The file's position in the model, starting at 1",
};

const DEFAULT_TEMPLATE = "{category}/{model}/{filename}";

export default function StorageSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["settings", "storage"], queryFn: () => settingsApi.getStorage() });
  const usage = useQuery({ queryKey: ["admin", "storage"], queryFn: () => adminApi.getStorageUsage() });
  // null = untouched: the field shows the saved template.
  const [draft, setDraft] = useState<string | null>(null);
  const [applyExisting, setApplyExisting] = useState(false);

  const saved = query.data?.template ?? DEFAULT_TEMPLATE;
  const template = draft ?? saved;
  const dirty = template.trim() !== saved;
  const examples = renderExamples(template);
  const shown = examples.length ? examples : (query.data?.plate_paths ?? []);

  const save = useMutation({
    mutationFn: () => settingsApi.updateStorage({ template, apply_existing: applyExisting }),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "storage"], data);
      toast.success(
        applyExisting
          ? `Saved. Moved ${data.moved} file(s)${data.skipped ? `; skipped ${data.skipped}` : ""}.`
          : "Storage structure saved for new and updated models.",
      );
      setDraft(null);
      setApplyExisting(false);
      // Moved files change paths shown on model pages.
      if (applyExisting) void queryClient.invalidateQueries({ queryKey: ["prints"] });
    },
  });

  return (
    <AdminSection
      title="Storage structure"
      description="Choose how managed model files are organized on disk. The model name is unique inside its Thingport category. Renaming a model also renames its file while preserving the extension."
    >
      {query.isError ? (
        <LoadError
          error={query.error}
          title="Couldn't load the storage settings."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <form
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if ((dirty || applyExisting) && !save.isPending) save.mutate();
          }}
        >
          {usage.data ? (
            <p className="text-sm text-muted">
              {formatFileSize(usage.data.model_bytes) || "0 B"} used by {usage.data.model_count}{" "}
              {usage.data.model_count === 1 ? "model" : "models"}.
            </p>
          ) : null}
          <Field label="Path template">
            {(p) => (
              <Input
                {...p}
                className="font-mono"
                value={template}
                placeholder={DEFAULT_TEMPLATE}
                disabled={query.isPending || save.isPending}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">Insert a placeholder</legend>
            {(query.data?.allowed_tokens ?? []).map((token) => (
              <Tip key={token} content={TOKEN_HELP[token] ?? token}>
                <Button
                  size="sm"
                  className="font-mono"
                  onClick={() => setDraft(addToken(template, token))}
                  disabled={save.isPending}
                >
                  {`{${token}}`}
                </Button>
              </Tip>
            ))}
          </fieldset>
          <div className="rounded-control border border-dashed border-border-strong p-3">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Example paths (two plates of one print)
            </p>
            {shown.length ? (
              <ul className="mt-1.5 space-y-0.5 font-mono text-xs break-all text-fg">
                {shown.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 font-mono text-xs text-muted">Enter a template to preview its path</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Checkbox
              checked={applyExisting}
              onCheckedChange={setApplyExisting}
              disabled={save.isPending}
              label="Reorganize existing managed files now"
            />
            <p className="pl-[26px] text-xs text-muted">
              Links to models keep working, since they use the model&apos;s ID rather than its file path.
            </p>
          </div>
          {save.error ? (
            <Alert tone="danger">{errorMessage(save.error, "Failed to save storage settings.")}</Alert>
          ) : null}
          <div>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={query.isPending || (!dirty && !applyExisting)}
            >
              Save storage structure
            </Button>
          </div>
        </form>
      )}
    </AdminSection>
  );
}

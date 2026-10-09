import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, useConfirm, useToast } from "@/ui";
import { AdminSection, LoadError } from "../AdminPage/parts";

/** Instance-wide and write-only: the server only reports whether a token is set. */
export default function ThingiverseSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const query = useQuery({ queryKey: ["settings", "thingiverse"], queryFn: () => settingsApi.getThingiverse() });
  const configured = query.data?.configured ?? false;

  const update = useMutation({
    mutationFn: (token: string | null) => settingsApi.updateThingiverse(token),
    onSuccess: (data, token) => {
      queryClient.setQueryData(["settings", "thingiverse"], data);
      setDraft("");
      toast.success(token ? "Access token saved." : "Access token removed.");
    },
  });

  const clear = async () => {
    const ok = await confirm({
      title: "Remove the Thingiverse token?",
      message: "Thingiverse imports will fail until you add a new one.",
      confirmLabel: "Remove token",
      destructive: true,
    });
    if (ok) update.mutate(null);
  };

  return (
    <AdminSection
      title="Thingiverse access token"
      description="Instance-wide credential for the official Thingiverse Developer API. Create an app at thingiverse.com/apps/create (any type, e.g. Desktop) and paste the access token it shows you."
    >
      {query.isError ? (
        <LoadError
          error={query.error}
          title="Couldn't load the Thingiverse setting."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !update.isPending) update.mutate(draft.trim());
          }}
        >
          {query.isPending ? null : (
            <Alert tone={configured ? "success" : "warning"}>
              {configured
                ? "An access token is currently configured."
                : "No access token is configured yet. Thingiverse imports will fail until one is set."}
            </Alert>
          )}
          <Field
            label="Access token"
            hint={
              configured
                ? "For security, the current token is never shown again. Leave this blank to keep it, or paste a new one to replace it."
                : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste a new token to replace the current one"
                autoComplete="off"
                disabled={query.isPending || update.isPending}
              />
            )}
          </Field>
          {update.error ? (
            <Alert tone="danger">{errorMessage(update.error, "Failed to save Thingiverse settings.")}</Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              loading={update.isPending && update.variables !== null}
              disabled={query.isPending || !draft.trim()}
            >
              Save
            </Button>
            {configured ? (
              <Button variant="danger-ghost" onClick={() => void clear()} disabled={update.isPending}>
                Remove token
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </AdminSection>
  );
}

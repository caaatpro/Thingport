import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Spinner, Switch } from "@/ui";
import { AdminSection, LoadError } from "../AdminPage/parts";

/** Saves as soon as it's switched. */
export default function SimplifySection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings", "rendering"], queryFn: () => settingsApi.getRendering() });
  const toggle = useMutation({
    mutationFn: (next: boolean) => settingsApi.updateRendering({ simplify_previews: next }),
    onSuccess: (data) => queryClient.setQueryData(["settings", "rendering"], data),
  });
  const enabled = toggle.isPending ? toggle.variables : (query.data?.simplify_previews ?? false);

  return (
    <AdminSection
      title="Simplify models before preview"
      description="Make lighter 3D previews of very detailed models."
    >
      {query.isError ? (
        <LoadError
          error={query.error}
          title="Failed to load rendering settings."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert title="How simplification works">
            <p>
              When a model has more than 1 million triangles, its 3D preview is reduced to about 1 million. The shape
              stays the same to within 1% of the model&apos;s size, so the preview looks the same on screen.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Only the preview is simplified. Model files, downloads and anything sent to a slicer are never changed.
              </li>
              <li>Heavy previews download faster and rotate smoothly on phones, tablets and older computers.</li>
              <li>
                Making the preview of a heavy model takes a few seconds longer on the server. Models under 1 million
                triangles are not affected.
              </li>
              <li>Changing this setting rebuilds only the previews it affects, the next time each model is opened.</li>
            </ul>
          </Alert>
          <div className="flex items-start gap-3">
            <Switch
              id="simplify-previews"
              checked={enabled}
              disabled={query.isPending || toggle.isPending}
              onCheckedChange={(next) => toggle.mutate(next)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <label htmlFor="simplify-previews" className="text-sm font-medium text-fg">
                Simplify previews of models over 1 million triangles
              </label>
              <p className="text-sm text-muted">
                {enabled
                  ? "On: previews of models over 1 million triangles are simplified."
                  : "Off: previews always show a model's full detail."}
              </p>
            </div>
            {toggle.isPending ? <Spinner className="size-4" /> : null}
          </div>
          {toggle.error ? (
            <Alert tone="danger">{errorMessage(toggle.error, "Failed to save rendering settings.")}</Alert>
          ) : null}
        </div>
      )}
    </AdminSection>
  );
}

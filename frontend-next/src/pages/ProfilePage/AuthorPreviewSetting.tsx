import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { setCachedAuthorPreviewEnabled } from "@/hooks/useAuthorPreviewEnabled";
import { Alert, Spinner, Switch } from "@/ui";
import { Section } from "./Section";

/** Whether hovering an author's name or avatar shows a preview card. */
export function AuthorPreviewSetting() {
  const id = useId();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings", "author-preview"], queryFn: () => settingsApi.getAuthorPreview() });
  const save = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.updateAuthorPreview(enabled),
    onSuccess: (res) => {
      queryClient.setQueryData(["settings", "author-preview"], res);
      setCachedAuthorPreviewEnabled(res.enabled);
    },
  });
  const checked = save.isPending ? (save.variables ?? true) : (query.data?.enabled ?? true);

  return (
    <Section
      title="Author preview"
      description="Show a preview card with the author's cover, details and latest models when you hover an author's name or avatar."
    >
      <div className="flex items-center gap-3">
        <Switch id={id} checked={checked} disabled={query.isPending || save.isPending} onCheckedChange={(next) => save.mutate(next)} />
        <label htmlFor={id} className="text-sm text-fg">
          Show author preview on hover
        </label>
        {save.isPending ? <Spinner className="size-4" label="Saving" /> : null}
      </div>
      {save.isError ? <Alert tone="danger" className="mt-3">{errorMessage(save.error, "Couldn't save. Try again.")}</Alert> : null}
    </Section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { SLICER_OPTIONS } from "@/constants/settingsOptions";
import { setCachedSlicerPreference } from "@/hooks/useSlicerPreference";
import { Alert, Field, Select, Spinner, type SelectOption } from "@/ui";
import { Section } from "./Section";

const OPTIONS: SelectOption[] = SLICER_OPTIONS.map((o) => ({ value: o.id, label: o.label }));

/** The slicer a model's "Open in Slicer" action launches. Saves as soon as it changes. */
export function SlicerPicker() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings", "slicer"], queryFn: () => settingsApi.getSlicer() });
  const save = useMutation({
    mutationFn: (slicer: string) => settingsApi.updateSlicer(slicer || null),
    onSuccess: (res) => {
      queryClient.setQueryData(["settings", "slicer"], res);
      setCachedSlicerPreference(res.slicer ?? null);
    },
  });

  return (
    <Section
      title="Slicer"
      description={'Your preferred slicer, used by a model\'s "Open in Slicer" action to launch it directly via that slicer\'s own link (e.g. bambustudio://).'}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Slicer" className="w-60">
          {(p) => (
            <Select
              {...p}
              value={save.isPending ? (save.variables ?? "") : (query.data?.slicer ?? "")}
              options={OPTIONS}
              placeholder={query.isPending ? "Loading…" : "Choose a slicer"}
              disabled={query.isPending || save.isPending}
              onChange={(next) => save.mutate(next)}
            />
          )}
        </Field>
        {save.isPending ? <Spinner className="mb-2 size-4" label="Saving" /> : null}
      </div>
      {query.isError ? <Alert tone="danger" className="mt-3">{errorMessage(query.error, "Couldn't load your slicer.")}</Alert> : null}
      {save.isError ? <Alert tone="danger" className="mt-3">{errorMessage(save.error, "Couldn't save. Try again.")}</Alert> : null}
    </Section>
  );
}

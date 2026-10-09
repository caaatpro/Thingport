import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, useToast } from "@/ui";
import { AdminSection, LoadError } from "../AdminPage/parts";
import { describeDuration } from "./helpers";

// Mirrors the backend's bounds.
const MIN_SECONDS = 5 * 60;
const MAX_SECONDS = 365 * 24 * 60 * 60;


/** How long a sign-in lasts. Only affects tokens issued after saving. */
export default function SessionSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["settings", "auth"], queryFn: () => settingsApi.getAuth() });
  // null = untouched: the field shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);

  const saved = query.data?.token_ttl_seconds;
  const text = draft ?? (saved === undefined ? "" : String(saved));
  const parsed = Number.parseInt(text, 10);
  const valid = Number.isFinite(parsed) && parsed >= MIN_SECONDS && parsed <= MAX_SECONDS;
  const approx = valid ? describeDuration(parsed) : null;

  const save = useMutation({
    mutationFn: () => settingsApi.updateAuth(parsed),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "auth"], data);
      setDraft(null);
      toast.success("Session length saved.");
    },
  });

  return (
    <AdminSection title="Session length" description="Control how long a signed-in session stays valid for the whole instance.">
      {query.isError ? (
        <LoadError error={query.error} title="Couldn't load the session length." onRetry={() => void query.refetch()} />
      ) : (
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !save.isPending) save.mutate();
          }}
        >
          <Alert title="What this controls">
            How long a freshly issued sign-in token stays valid before that user is asked to log in again. Applies instance-wide to every new login,
            registration, and email verification. Changing this only affects tokens issued from now on; anyone already signed in keeps whatever length was
            active when they logged in.
          </Alert>
          <Field
            label="Session length (seconds)"
            error={text !== "" && !valid ? "Enter a number between 300 (5 minutes) and 31536000 (1 year) seconds." : undefined}
            hint={approx ? `≈ ${approx}` : "Between 5 minutes and 1 year."}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                value={text}
                disabled={query.isPending || save.isPending}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
          {save.error ? <Alert tone="danger">{errorMessage(save.error, "Failed to save session settings.")}</Alert> : null}
          <div>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={query.isPending || !valid || parsed === saved}>
              Save
            </Button>
          </div>
        </form>
      )}
    </AdminSection>
  );
}

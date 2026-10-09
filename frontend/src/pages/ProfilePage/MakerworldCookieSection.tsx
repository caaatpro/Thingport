import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { useMakerWorldCookie } from "@/app/preferences";
import { errorMessage } from "@/app/queryClient";
import { Alert, Badge, Button, Field, Textarea } from "@/ui";
import { Section } from "./Section";

/** Never displays the stored cookie. Saves it on the server and keeps a copy in this browser for imports. */
export function MakerworldCookieSection() {
  const queryClient = useQueryClient();
  const [localCookie, setLocalCookie] = useMakerWorldCookie();
  const query = useQuery({ queryKey: ["settings", "makerworld"], queryFn: () => settingsApi.getMakerworld() });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const save = useMutation({
    mutationFn: (cookie: string | null) => settingsApi.updateMakerworld(cookie),
    onSuccess: (res, cookie) => {
      setLocalCookie(cookie ?? "");
      queryClient.setQueryData(["settings", "makerworld"], res);
      setEditing(false);
      setDraft("");
    },
  });

  const configured = query.data?.configured ?? Boolean(localCookie.trim());

  return (
    <Section
      title="MakerWorld"
      description="Required to import links or models from MakerWorld. Paste the Cookie header from a logged-in makerworld.com request."
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="MakerWorld cookie">
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="example: mw_session=...; mw_token=...;"
                disabled={save.isPending}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={save.isPending}
              disabled={!draft.trim()}
              onClick={() => save.mutate(draft.trim())}
            >
              Save
            </Button>
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => {
                setEditing(false);
                setDraft("");
                save.reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={configured ? "accent" : "outline"}>{configured ? "Added" : "Not added"}</Badge>
          <Button
            size="sm"
            onClick={() => {
              save.reset();
              setEditing(true);
            }}
          >
            {configured ? "Edit" : "Add"}
          </Button>
          {configured ? (
            <Button size="sm" variant="danger-ghost" loading={save.isPending} onClick={() => save.mutate(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      )}
      {save.isError ? (
        <Alert tone="danger" className="mt-3">
          {errorMessage(save.error, "Couldn't save. Try again.")}
        </Alert>
      ) : null}
    </Section>
  );
}

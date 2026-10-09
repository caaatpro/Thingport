import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { tokensApi, type ApiToken, type CreatedApiToken } from "@/api/tokens";
import { errorMessage } from "@/app/queryClient";
import { Alert, Badge, Button, Field, Input, Select, Skeleton, useConfirm, useToast } from "@/ui";
import { copyText } from "@/utils/copyText";
import { Section } from "./Section";

const EXPIRY_OPTIONS = [
  { value: "0", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
];

const formatDate = (iso: string) => new Date(iso).toLocaleString();

/** One line of metadata under a token's name. */
export function tokenDetails(token: ApiToken): string {
  return [
    `Created ${formatDate(token.created_at)}`,
    token.last_used_at ? `Last used ${formatDate(token.last_used_at)}` : "Never used",
    token.expires_at ? `Expires ${formatDate(token.expires_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Shown once, right after creation: the secret can't be retrieved again. */
function NewToken({ token, onDismiss }: { token: CreatedApiToken; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copy = async () => {
    const ok = await copyText(token.token);
    setCopied(ok);
    setCopyFailed(!ok);
  };
  return (
    <Alert
      tone="success"
      action={
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      }
    >
      <p className="font-medium text-fg">Token "{token.name}" created</p>
      <p className="mt-0.5">Copy it now: for security it is shown only once and can't be retrieved later.</p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          readOnly
          aria-label="New token"
          value={token.token}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {copyFailed ? (
        <p className="mt-1 text-xs text-danger">Couldn't copy automatically. Select the token and copy it by hand.</p>
      ) : null}
    </Alert>
  );
}

/** Create and revoke the tokens that tools such as the Thingport Grab extension sign in with, so they
 *  never need the account password. */
export function ApiTokensSection() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("0");
  const [fresh, setFresh] = useState<CreatedApiToken | null>(null);

  const query = useQuery({ queryKey: ["settings", "tokens"], queryFn: () => tokensApi.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings", "tokens"] });

  const create = useMutation({
    mutationFn: () => tokensApi.create(name.trim(), Number(expiry) || null),
    onSuccess: (created) => {
      setFresh(created);
      setName("");
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (token: ApiToken) => tokensApi.revoke(token.id),
    onSuccess: (_, token) => {
      setFresh((current) => (current?.id === token.id ? null : current));
      toast.success(`Revoked "${token.name}".`);
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't revoke the token.")),
  });

  const handleRevoke = async (token: ApiToken) => {
    const ok = await confirm({
      title: "Revoke token",
      message: `Revoke "${token.name}"? Anything using it will stop working immediately.`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (ok) revoke.mutate(token);
  };

  const tokens = query.data;
  const now = query.dataUpdatedAt;

  return (
    <Section
      id="api-tokens"
      title="API tokens"
      description="Tokens let tools such as the Thingport Grab browser extension use your account without your password. A token can only do what that tool needs, and you can revoke it at any time."
    >
      <div className="flex flex-col gap-4">
        {fresh ? <NewToken token={fresh} onDismiss={() => setFresh(null)} /> : null}

        {query.isError ? (
          <Alert
            tone="danger"
            action={
              <Button size="sm" onClick={() => void query.refetch()}>
                Retry
              </Button>
            }
          >
            {errorMessage(query.error, "Couldn't load your tokens.")}
          </Alert>
        ) : !tokens ? (
          <Skeleton className="h-12" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted">No tokens yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((token) => {
              const expired = token.expires_at ? new Date(token.expires_at).getTime() <= now : false;
              return (
                <li key={token.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{token.name}</span>
                      <code className="text-xs text-muted">{token.prefix}…</code>
                      <Badge tone="outline">{token.scope}</Badge>
                      {expired ? <Badge tone="warning">Expired</Badge> : null}
                    </div>
                    <p className="text-xs text-muted">{tokenDetails(token)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    aria-label={`Revoke ${token.name}`}
                    disabled={revoke.isPending}
                    onClick={() => void handleRevoke(token)}
                  >
                    Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <form
          className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field label="Token name" className="flex-1">
            {(p) => (
              <Input
                {...p}
                value={name}
                maxLength={60}
                placeholder="e.g. Chrome on my laptop"
                disabled={create.isPending}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Expires" className="sm:w-40">
            {(p) => (
              <Select {...p} value={expiry} options={EXPIRY_OPTIONS} disabled={create.isPending} onChange={setExpiry} />
            )}
          </Field>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
            Create token
          </Button>
        </form>
        {create.isError ? (
          <Alert tone="danger">{errorMessage(create.error, "Couldn't create the token.")}</Alert>
        ) : null}
      </div>
    </Section>
  );
}

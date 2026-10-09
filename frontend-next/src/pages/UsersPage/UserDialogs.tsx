import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import { adminApi, type AdminUser } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Checkbox, Field, Input, Modal, Spinner } from "@/ui";
import { copyText } from "@/utils/copyText";
import { formatFileSize } from "@/utils/fileSize";

type Props = {
  user: AdminUser;
  onClose: () => void;
  /** Called after a successful change, with the message to toast. */
  onChanged: (message: string) => void;
};

export function EditUserDialog({ user, onClose, onChanged }: Props) {
  const formId = useId();
  const [name, setName] = useState(user.display_name);
  const save = useMutation({
    mutationFn: () => adminApi.updateUser(user.id, { display_name: name.trim() }),
    onSuccess: () => {
      onChanged("Saved.");
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit user"
      size="sm"
      locked={save.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !save.isPending) save.mutate();
        }}
      >
        {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        <Field label="Name" required hint={user.email}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

/** A read-only value with a copy button: reset links and generated passwords. */
export function CopyField({ value, label, copyLabel = "Copy", mono = true }: { value: string; label: string; copyLabel?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(e) => e.target.select()}
        className={mono ? "font-mono text-xs" : undefined}
      />
      <Button
        icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        onClick={async () => setCopied(await copyText(value))}
      >
        {copied ? "Copied" : copyLabel}
      </Button>
    </div>
  );
}

export function ResetLinkDialog({ user, onClose }: Omit<Props, "onChanged">) {
  // One link per opened dialog: the query is never refetched or kept.
  const link = useQuery({
    queryKey: ["admin", "reset-link", user.id],
    queryFn: () => adminApi.createResetLink(user.id),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Password reset link"
      description={`Send this link to ${user.display_name}. It can be used once and works for one hour.`}
      footer={<Button onClick={onClose}>Close</Button>}
      hideClose
    >
      <div className="flex flex-col gap-3">
        {link.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" /> Creating the link…
          </p>
        ) : null}
        {link.error ? <Alert tone="danger">{errorMessage(link.error)}</Alert> : null}
        {link.data ? (
          <>
            <CopyField value={link.data.url} label="Reset link" copyLabel="Copy link" />
            <p className="text-xs text-muted">
              Expires {new Date(link.data.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export function SignOutDialog({ user, onClose, onChanged }: Props) {
  const [revoke, setRevoke] = useState(false);
  const signOut = useMutation({
    mutationFn: () => adminApi.signOutUser(user.id, revoke),
    onSuccess: (res) => {
      onChanged(
        res.revoked_tokens > 0
          ? `${user.display_name} was signed out and ${res.revoked_tokens} API tokens were revoked.`
          : `${user.display_name} was signed out.`,
      );
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Sign ${user.display_name} out everywhere?`}
      description="Every browser session of this user ends immediately. They can sign in again."
      size="sm"
      locked={signOut.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={signOut.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={signOut.isPending} onClick={() => signOut.mutate()}>
            Sign out
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {user.api_token_count > 0 ? (
          <Checkbox checked={revoke} onCheckedChange={setRevoke} label={`Also revoke their API tokens (${user.api_token_count})`} />
        ) : null}
        {signOut.error ? <Alert tone="danger">{errorMessage(signOut.error)}</Alert> : null}
      </div>
    </Modal>
  );
}

/** Deleting an account is permanent, so the admin types its email to confirm. */
export function DeleteUserDialog({ user, onClose, onChanged }: Props) {
  const formId = useId();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();
  const remove = useMutation({
    mutationFn: () => adminApi.deleteUser(user.id),
    onSuccess: () => {
      onChanged(`${user.display_name} was deleted.`);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${user.display_name}?`}
      size="sm"
      locked={remove.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={remove.isPending} disabled={!matches}>
            Delete user
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches && !remove.isPending) remove.mutate();
        }}
      >
        <Alert tone="warning">
          This permanently deletes the account together with {user.print_count} models (
          {formatFileSize(user.storage_bytes) || "0 B"}), collections and API tokens. It can&apos;t be undone.
        </Alert>
        {remove.error ? <Alert tone="danger">{errorMessage(remove.error)}</Alert> : null}
        <Field label={`Type ${user.email} to confirm`}>
          {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={remove.isPending} />}
        </Field>
      </form>
    </Modal>
  );
}

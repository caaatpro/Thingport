import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Modal, Select } from "@/ui";
import { CopyField } from "./UserDialogs";

type Created = { email: string; generatedPassword: string | null };

const ROLES = [
  { value: "MEMBER", label: "Member" },
  { value: "ADMIN", label: "Admin" },
];

/** Creates the account directly: the way to add people on an instance without outgoing email. */
export default function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  return open ? <CreateForm onClose={onClose} onCreated={onCreated} /> : null;
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const formId = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const shortPassword = password.length > 0 && password.length < 8;
  const create = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        email: email.trim(),
        display_name: name.trim(),
        role: role === "ADMIN" ? "ADMIN" : "MEMBER",
        ...(password ? { password } : {}),
      }),
    onSuccess: (res) => {
      setCreated({ email: res.email, generatedPassword: res.generated_password });
      onCreated();
    },
  });

  if (created) {
    return (
      <Modal
        open
        onOpenChange={(next) => !next && onClose()}
        title="User created"
        size="sm"
        hideClose
        footer={
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {created.generatedPassword
              ? `Give this password to ${created.email}. It is shown only once; they can change it in their profile.`
              : `The account is ready. ${created.email} can sign in with the password you set.`}
          </p>
          {created.generatedPassword ? (
            <CopyField value={created.generatedPassword} label="Generated password" />
          ) : null}
        </div>
      </Modal>
    );
  }

  const canSubmit = Boolean(email.trim() && name.trim()) && !shortPassword;
  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title="Add a user"
      description="The account is created right away and no email is sent. Leave the password empty to generate one."
      size="sm"
      locked={create.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={create.isPending} disabled={!canSubmit}>
            Create user
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !create.isPending) create.mutate();
        }}
      >
        {create.error ? <Alert tone="danger">{errorMessage(create.error, "Failed to create the user")}</Alert> : null}
        <Field label="Email" required>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={create.isPending}
            />
          )}
        </Field>
        <Field label="Name" required>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} disabled={create.isPending} />}
        </Field>
        <Field label="Role">
          {(p) => <Select id={p.id} value={role} onChange={setRole} options={ROLES} disabled={create.isPending} />}
        </Field>
        <Field
          label="Password (optional, at least 8 characters)"
          error={shortPassword ? "Use at least 8 characters, or leave it empty." : undefined}
        >
          {(p) => (
            <Input
              {...p}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              disabled={create.isPending}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

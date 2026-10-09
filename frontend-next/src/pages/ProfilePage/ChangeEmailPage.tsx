import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, PageHeader } from "@/ui";

export default function ChangeEmailPage() {
  const { user, updateUser } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: () => authApi.updateProfile({ current_password: password, email: email.trim() }),
    onSuccess: ({ user: updated }) => {
      updateUser(updated);
      setPassword("");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const updated = save.data?.user;
  return (
    <div className="max-w-md">
      <PageHeader title="Change email" subtitle="Update the email address used to sign in." backTo="/profile" backLabel="Back to Profile" />
      <form onSubmit={submit} className="flex flex-col gap-4">
        {user?.pending_email && !updated ? (
          <Alert tone="info">
            A confirmation link was sent to {user.pending_email}. Click it to finish changing your email. Submit this form again to resend.
          </Alert>
        ) : null}
        {updated ? (
          <Alert tone="success">{updated.pending_email ? `Pending confirmation for ${updated.pending_email}` : "Email updated."}</Alert>
        ) : null}
        {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        <Field label="New email" required>
          {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Current password" required>
          {(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save email
        </Button>
      </form>
    </div>
  );
}

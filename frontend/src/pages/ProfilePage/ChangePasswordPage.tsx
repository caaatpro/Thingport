import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, PageHeader } from "@/ui";
import { passwordProblem } from "./passwordRules";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => authApi.updateProfile({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirmation("");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.reset();
    const found = passwordProblem(next, confirmation);
    setProblem(found);
    if (!found) save.mutate();
  };

  return (
    <div className="max-w-md">
      <PageHeader
        title="Change password"
        subtitle="Update your account password."
        backTo="/profile"
        backLabel="Back to Profile"
      />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {save.isSuccess ? <Alert tone="success">Password updated.</Alert> : null}
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        <Field label="Current password" required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label="New password" hint="At least 8 characters" required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label="Confirm new password" required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!current}>
          Save password
        </Button>
      </form>
    </div>
  );
}

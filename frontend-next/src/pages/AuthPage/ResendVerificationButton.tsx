import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { Button } from "@/ui";

/** The backend's reply is deliberately generic, so "sent" is all there is to say. */
export default function ResendVerificationButton({ email }: { email: string }) {
  const resend = useMutation({ mutationFn: () => authApi.resendVerification(email) });

  if (resend.isSuccess) {
    return (
      <output className="block text-sm font-medium text-success">Sent! Check your inbox.</output>
    );
  }
  return (
    <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
      {resend.isError ? "Couldn’t send. Try again" : "Resend email"}
    </Button>
  );
}

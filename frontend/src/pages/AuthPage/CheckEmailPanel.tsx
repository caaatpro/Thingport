import { MailCheck } from "lucide-react";
import ResendVerificationButton from "./ResendVerificationButton";

export default function CheckEmailPanel({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <MailCheck className="size-10 text-accent" strokeWidth={1.5} aria-hidden />
      <h2 className="text-lg font-semibold text-fg">Check your email</h2>
      <p className="text-sm text-muted">
        We sent a confirmation link to <strong className="font-medium text-fg">{email}</strong>. Click it to finish
        creating your account.
      </p>
      <ResendVerificationButton email={email} />
    </div>
  );
}

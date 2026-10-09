import type { ReactNode } from "react";
import { Card } from "@/ui";

/** A titled block of the profile page: heading and description above, the control in a card. */
export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold tracking-tight text-fg">
        {title}
      </h2>
      {description ? <p className="mt-0.5 mb-3 text-sm text-muted">{description}</p> : <div className="mb-3" />}
      <Card padding="lg">{children}</Card>
    </section>
  );
}

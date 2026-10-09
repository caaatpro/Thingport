import { useState } from "react";
import { PageHeader, Segmented } from "@/ui";
import DatabaseTab from "./DatabaseTab";
import SmtpTab from "./SmtpTab";

type Tab = "smtp" | "database";

/** Credentials this instance uses to reach other systems: outgoing email and its database. */
export default function ConnectionsPage() {
  const [tab, setTab] = useState<Tab>("smtp");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Connections"
        subtitle="Email delivery and the database connection."
        backTo="/admin"
        actions={
          <Segmented
            label="Connection"
            value={tab}
            onChange={setTab}
            options={[
              { value: "smtp", label: "SMTP" },
              { value: "database", label: "Database" },
            ]}
          />
        }
      />
      {tab === "smtp" ? <SmtpTab /> : <DatabaseTab />}
    </div>
  );
}

import { PageHeader } from "@/ui";
import SessionSection from "./SessionSection";
import StorageSection from "./StorageSection";
import ThingiverseSection from "./ThingiverseSection";

/** Instance-wide settings, one card per concern. */
export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Admin Settings" subtitle="Storage layout, Thingiverse access and session length." backTo="/admin" />
      <div className="space-y-4">
        <StorageSection />
        <ThingiverseSection />
        <SessionSection />
      </div>
    </div>
  );
}

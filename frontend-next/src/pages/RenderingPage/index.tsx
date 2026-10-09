import { PageHeader } from "@/ui";
import PreviewsSection from "./PreviewsSection";
import SimplifySection from "./SimplifySection";

/** How 3D previews are produced for this instance. */
export default function RenderingPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Rendering" subtitle="How 3D previews are generated." backTo="/admin" />
      <div className="space-y-4">
        <PreviewsSection />
        <SimplifySection />
      </div>
    </div>
  );
}

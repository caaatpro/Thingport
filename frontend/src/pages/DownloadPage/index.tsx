import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import chromeLogo from "@/assets/logos/browsers/chrome.svg";
import extensionIcon from "@/assets/logos/thingport-icon-color.svg";
import { EXTENSION_ZIP_URL } from "@/constants/extension";
import { Button, Card, PageHeader } from "@/ui";

const STEPS = [
  "Download the .zip and unzip it. Keep the unzipped folder somewhere permanent.",
  "Open chrome://extensions in Chrome (or any Chromium browser).",
  "Turn on Developer mode with the switch in the top-right corner.",
  "Click Load unpacked and pick the unzipped folder.",
  "Click the extension, enter this instance's address and an API token from Profile, then save.",
];

export default function DownloadPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Downloads"
        subtitle="Companion tools that work alongside your Thingport instance."
        className="mb-0"
      />

      <section aria-labelledby="grab-title" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <img src={extensionIcon} alt="" className="mt-0.5 size-8" />
          <div>
            <h2 id="grab-title" className="text-base font-semibold tracking-tight text-fg">
              Thingport Grab
            </h2>
            <p className="text-sm text-muted">
              A browser extension that imports MakerWorld, Thingiverse, Printables and Cults3D models straight from
              their own pages.
            </p>
          </div>
        </div>

        <Card padding="lg" className="flex max-w-xl flex-col items-start gap-4">
          <div className="flex items-center gap-3">
            <img src={chromeLogo} alt="" className="size-8" />
            <p className="text-sm font-semibold text-fg">Thingport Grab for Chrome</p>
          </div>
          <Button variant="primary" asChild>
            <a href={EXTENSION_ZIP_URL} download>
              <Download className="size-4" aria-hidden />
              Download (.zip)
            </a>
          </Button>
        </Card>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-fg">Install it</h3>
          <ol className="flex max-w-xl list-decimal flex-col gap-1.5 pl-5 text-sm text-muted marker:text-subtle">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 max-w-xl text-sm text-muted">
            Create the token under{" "}
            <Link to="/profile#api-tokens" className="text-accent-text underline-offset-4 hover:underline">
              Profile, API tokens
            </Link>
            . To update, download the .zip again, unzip it over the old folder and click Reload on the extension in
            chrome://extensions.
          </p>
        </div>
      </section>
    </div>
  );
}

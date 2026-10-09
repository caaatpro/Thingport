import { useState } from "react";
import { Alert, Button, Field, Input, Modal, Select } from "@/ui";
import type { MakerworldProfileScope } from "@/api/imports";
import { IMPORT_PROVIDER_INFO } from "@/constants/importProviders";
import {
  detectImportProvider,
  IMPORT_LINK_EXAMPLES,
  isMakerworldCollectionUrl,
  isMakerworldModelUrl,
  type ImportProviderKey,
} from "@/utils/importLinkDetection";

const PROVIDERS: ImportProviderKey[] = ["makerworld", "thingiverse", "printables"];

const SCOPE_OPTIONS = [
  { value: "url", label: "Print profile from the link" },
  { value: "designer", label: "All designer print profiles" },
  { value: "all", label: "Designer and community print profiles" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importing: boolean;
  /** Resolves when the import flow ends; throws to show an error here. `onPrompt` closes this dialog. */
  onSubmit: (url: string, scope: MakerworldProfileScope, onPrompt: () => void) => Promise<void>;
};

/** Paste a MakerWorld / Printables / Thingiverse / Cults3D link. Provider chips light up as the link is recognised. */
export default function ImportLinkDialog({ open, onOpenChange, importing, onSubmit }: Props) {
  const [link, setLink] = useState("");
  const [example, setExample] = useState<ImportProviderKey | null>(null);
  const [scope, setScope] = useState<MakerworldProfileScope>("url");
  const [error, setError] = useState<string | null>(null);

  const detected = detectImportProvider(link);
  const blocked = isMakerworldCollectionUrl(link);
  const isMakerworldModel = isMakerworldModelUrl(link);
  const canSubmit = Boolean(link.trim()) && !blocked && !importing;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await onSubmit(link, isMakerworldModel ? scope : "url", () => onOpenChange(false));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed. Check the link and try again.");
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Import from link"
      description="Paste a link to a model from MakerWorld, Printables, Thingiverse or Cults3D."
      locked={importing}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={importing} disabled={!canSubmit}>
            {importing ? "Importing…" : "Import"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Supported sites (select one for example links)</legend>
          {PROVIDERS.map((provider) => {
            const info = IMPORT_PROVIDER_INFO[provider];
            const active = detected === provider;
            return (
              <button
                key={provider}
                type="button"
                aria-pressed={example === provider}
                onClick={() => setExample((prev) => (prev === provider ? null : provider))}
                style={active ? { backgroundColor: info.color, color: info.textColor ?? "#fff" } : undefined}
                className={
                  active
                    ? "rounded-full px-3 py-1 text-xs font-semibold"
                    : "rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted hover:text-fg aria-pressed:ring-2 aria-pressed:ring-accent/40"
                }
              >
                {info.label}
              </button>
            );
          })}
        </fieldset>

        {example ? (
          <Alert tone="info" title={`Example ${IMPORT_PROVIDER_INFO[example].label} links`}>
            <p className="break-all">Model: {IMPORT_LINK_EXAMPLES[example].model}</p>
            <p className="break-all">
              Collection: {IMPORT_LINK_EXAMPLES[example].collection}
              {example === "makerworld" ? " (requires Thingport Grab)" : ""}
            </p>
          </Alert>
        ) : null}

        {blocked ? (
          <Alert tone="warning">
            MakerWorld collections can only be imported with the Thingport Grab browser extension, not here. Paste a single
            model link instead, or use Thingport Grab to bulk-import a whole collection.
          </Alert>
        ) : null}

        <Field label="Link">
          {(props) => (
            <Input
              {...props}
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                const { key: pressed } = event;
                if (pressed === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Paste model link (MakerWorld, Printables, Thingiverse…)"
              disabled={importing}
            />
          )}
        </Field>

        {isMakerworldModel ? (
          <Field
            label="Print profiles"
            hint={
              scope === "url"
                ? "The profile the link points to, or the model's default one. Other profiles can be added later."
                : "Each profile becomes its own file on the model. They're imported one at a time in the background, which can take a few minutes."
            }
          >
            {(props) => (
              <Select
                id={props.id}
                value={scope}
                onChange={(v) => setScope(v as MakerworldProfileScope)}
                options={SCOPE_OPTIONS}
                disabled={importing}
              />
            )}
          </Field>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

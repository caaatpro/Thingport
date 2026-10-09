import { useState } from "react";
import type { Category, CategoryMetaInput } from "@/api/categories";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Modal, Textarea } from "@/ui";

type Props = {
  category: Category;
  onClose: () => void;
  onSave: (meta: CategoryMetaInput) => Promise<unknown>;
};

const FORM_ID = "category-details-form";
const IDS_HINT = "Separate several with “;”. Imports from that site land here if their category is any of these.";

/**
 * Title and description shown above the category, plus the site category IDs that route imports here.
 * Blank fields clear the details. A server error shows inline and keeps the edits.
 */
export function CategoryMetaDialog({ category, onClose, onSave }: Props) {
  const [title, setTitle] = useState(category.meta_title ?? "");
  const [description, setDescription] = useState(category.meta_description ?? "");
  const [makerworld, setMakerworld] = useState(category.makerworld_cat_ids);
  const [thingiverse, setThingiverse] = useState(category.thingiverse_cat_ids);
  const [printables, setPrintables] = useState(category.printables_cat_ids);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        metaTitle: title.trim() || null,
        metaDescription: description.trim() || null,
        makerworldCatIds: makerworld,
        thingiverseCatIds: thingiverse,
        printablesCatIds: printables,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the details. Try again."));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      locked={saving}
      title={`Details — ${category.name || "Untitled"}`}
      size="md"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Title">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />}
        </Field>
        <Field label="Description">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          )}
        </Field>
        <Field label="MakerWorld category IDs" hint={IDS_HINT}>
          {(p) => (
            <Input
              {...p}
              placeholder="e.g. 800;71;1001"
              value={makerworld}
              onChange={(e) => setMakerworld(e.target.value)}
              disabled={saving}
            />
          )}
        </Field>
        <Field label="Thingiverse category IDs">
          {(p) => (
            <Input
              {...p}
              placeholder="e.g. 800;71;1001"
              value={thingiverse}
              onChange={(e) => setThingiverse(e.target.value)}
              disabled={saving}
            />
          )}
        </Field>
        <Field label="Printables category IDs">
          {(p) => (
            <Input
              {...p}
              placeholder="e.g. 800;71;1001"
              value={printables}
              onChange={(e) => setPrintables(e.target.value)}
              disabled={saving}
            />
          )}
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </form>
    </Modal>
  );
}

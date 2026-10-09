import { useId, useState, type FormEvent } from "react";
import type { Collection, CollectionInput } from "@/api/collections";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Field, Input, Modal, TagInput, Textarea } from "@/ui";

type Props = {
  /** Edit mode is create mode prefilled from this. */
  collection?: Collection | null;
  onClose: () => void;
  /** Reject to keep the dialog open and show the message. */
  onSubmit: (input: CollectionInput) => Promise<void>;
};

/** Mount it when it should open (state starts from `collection`). */
export function CollectionFormDialog({ collection, onClose, onSubmit }: Props) {
  const formId = useId();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [tags, setTags] = useState<string[]>(collection?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(collection);
  const trimmedName = name.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: trimmedName, description: description.trim() || null, tags });
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the collection. Try again."));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? "Edit collection" : "New collection"}
      locked={saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving} disabled={!trimmedName}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Name" required>
          {(p) => (
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            <Input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          )}
        </Field>
        <Field label="Description">
          {(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />}
        </Field>
        <Field label="Tags">{(p) => <TagInput id={p.id} value={tags} onChange={setTags} placeholder="Add tags" disabled={saving} />}</Field>
      </form>
    </Modal>
  );
}

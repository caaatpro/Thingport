import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  GripVertical,
  ImagePlus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { printsApi, type Print } from "@/api/prints";
import { categoriesApi } from "@/api/categories";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import { useInvalidatePrints } from "@/features/prints";
import { authorDisplay } from "@/features/prints/authorDisplay";
import {
  Alert,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea,
  TagInput,
  useConfirm,
  useToast,
  cn,
  type SelectOption,
} from "@/ui";
import { buildCategoryTree, flattenCategoryTree } from "@/utils/categoryTree";
import { localId } from "@/utils/localId";
import {
  imageKey,
  initialValues,
  isDirty,
  moveItem,
  plateKey,
  saveModelEdits,
  validate,
  type EditValues,
  type ImageItem,
  type PlateItem,
} from "./editModel";
import { SortableList } from "./Sortable";

type Props = {
  print: Print;
  onClose: () => void;
};

const iconBtn = "size-7";

/** Edits are staged locally and committed on "Update"; closing with changes asks first. */
export default function EditModelModal({ print, onClose }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePrints();
  const { user: viewer } = useAuth();
  const isOwner = print.is_owner !== false;

  const [values, setValues] = useState<EditValues>(() => initialValues(print));
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (next: Partial<EditValues>) => setValues((prev) => ({ ...prev, ...next }));

  // Object URLs for freshly picked images; released when the dialog goes away.
  const createdUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of createdUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list(), enabled: isOwner });
  const categoryOptions = useMemo<SelectOption[]>(() => {
    const flat = flattenCategoryTree(buildCategoryTree(categories.data ?? []));
    return [
      { value: "", label: "No category" },
      ...flat.map(({ category, depth }) => ({
        value: category.id,
        label: category.name,
        // Top-level categories only group; a model goes in one of their children (unless it already sits there).
        disabled: depth === 0 && category.id !== values.categoryId,
        indent: Math.max(0, depth - 1),
      })),
    ];
  }, [categories.data, values.categoryId]);

  const errors = validate(values);
  const dirty = isDirty(print, values, isOwner);

  const save = useMutation({
    mutationFn: async () => {
      const ctx = { latest: print, previewError: null as string | null, skippedImages: 0 };
      try {
        await saveModelEdits(print, values, isOwner, ctx);
      } catch (err) {
        // Whatever was saved before the failure still shows on the page.
        throw Object.assign(err instanceof Error ? err : new Error("Update failed"), { saved: ctx.latest });
      }
      return ctx;
    },
    onSuccess: (ctx) => {
      queryClient.setQueryData(["print", print.id], ctx.latest);
      void invalidate();
      onClose();
      if (ctx.skippedImages > 0) {
        toast.warning(
          ctx.skippedImages === 1
            ? "Couldn't process 1 image, so it wasn't added. Try a JPG or PNG."
            : `Couldn't process ${ctx.skippedImages} images, so they weren't added. Try JPG or PNG.`,
        );
      }
      if (ctx.previewError) toast.warning(ctx.previewError);
      else toast.success("Model updated");
    },
    onError: (err) => {
      const saved = (err as { saved?: Print }).saved;
      if (saved) queryClient.setQueryData(["print", print.id], saved);
      void invalidate();
      setError(errorMessage(err, "Couldn't update the model. Try again."));
    },
  });
  const saving = save.isPending;

  const requestClose = async () => {
    if (saving) return;
    if (
      dirty &&
      !(await confirm({
        message: "Discard all unsaved changes to this model?",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return;
    onClose();
  };

  const submit = () => {
    setShowErrors(true);
    if (errors.title || errors.plates) return;
    setError(null);
    save.mutate();
  };

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const added = Array.from(files).map((file): ImageItem => {
      const previewUrl = URL.createObjectURL(file);
      createdUrls.current.push(previewUrl);
      return { kind: "new", localId: localId(), file, previewUrl };
    });
    patch({ images: [...values.images, ...added] });
  };
  const addPlates = (files: FileList | null) => {
    if (!files?.length) return;
    const added = Array.from(files).map((file): PlateItem => ({
      kind: "new",
      localId: localId(),
      file,
      name: file.name,
    }));
    patch({ plates: [...values.plates, ...added] });
  };
  const renamePlate = (key: string, name: string) =>
    patch({ plates: values.plates.map((p) => (plateKey(p) === key ? { ...p, name } : p)) });
  const removePlate = (key: string) => {
    if (values.plates.length <= 1) return;
    patch({ plates: values.plates.filter((p) => plateKey(p) !== key) });
  };
  const moveImage = (index: number, dir: -1 | 1) => patch({ images: moveItem(values.images, index, dir) });
  const movePlate = (index: number, dir: -1 | 1) => patch({ plates: moveItem(values.plates, index, dir) });

  const author = authorDisplay(print, viewer);
  const hasImportedAuthor = Boolean(print.author || print.creator || print.source_provider);

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
      title="Edit model"
      size="xl"
      locked={saving}
      footer={
        <>
          <Button onClick={() => void requestClose()} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Update
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-6 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field label="Title" error={showErrors ? errors.title : undefined}>
          {(control) => (
            <Input
              {...control}
              value={values.title}
              onChange={(e) => patch({ title: e.target.value })}
              disabled={saving}
            />
          )}
        </Field>

        {isOwner ? (
          <Field label="Category">
            {(control) => (
              <Select
                id={control.id}
                value={values.categoryId ?? ""}
                onChange={(value) => patch({ categoryId: value || null })}
                options={categoryOptions}
                disabled={saving || categories.isPending}
              />
            )}
          </Field>
        ) : null}

        {isOwner ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">Author</p>
              <p className="truncate text-sm text-muted">
                {values.resetAuthor ? "You (after Update)" : (author.name ?? "Unknown author")}
              </p>
            </div>
            {hasImportedAuthor ? (
              values.resetAuthor ? (
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => patch({ resetAuthor: false })}>
                  Undo
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  icon={<RotateCcw className="size-4" aria-hidden />}
                  onClick={() => patch({ resetAuthor: true })}
                >
                  Reset author
                </Button>
              )
            ) : null}
          </div>
        ) : null}

        <section aria-labelledby="edit-images" className="border-t border-border pt-5">
          <h3 id="edit-images" className="mb-2 text-sm font-semibold text-fg">
            Preview images
          </h3>
          <SortableList
            label="Preview images"
            direction="horizontal"
            items={values.images}
            getId={imageKey}
            onReorder={(images) => patch({ images })}
            className="flex gap-2 overflow-x-auto pb-1"
            itemClassName="shrink-0"
            trailing={
              <li className="shrink-0">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => imageInput.current?.click()}
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border-strong text-xs text-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  <ImagePlus className="size-5" aria-hidden />
                  Add images
                </button>
              </li>
            }
          >
            {(img, index, drag) => (
              <div className="relative size-24 overflow-hidden rounded-control border border-border bg-surface-2">
                <img
                  src={img.kind === "existing" ? printsApi.fileUrl(img.url) : img.previewUrl}
                  alt=""
                  draggable={false}
                  {...drag.attributes}
                  {...drag.listeners}
                  aria-label={`Drag preview image ${index + 1}`}
                  className="size-full cursor-grab touch-none object-cover"
                />
                {index === 0 ? (
                  <Badge tone="solid" className="absolute bottom-1 left-1">
                    Thumbnail
                  </Badge>
                ) : null}
                <IconButton
                  label={`Remove image ${index + 1}`}
                  variant="overlay"
                  noTip
                  disabled={saving}
                  className={cn(iconBtn, "absolute top-1 right-1")}
                  onClick={() => patch({ images: values.images.filter((i) => imageKey(i) !== imageKey(img)) })}
                >
                  <X className="size-3.5" aria-hidden />
                </IconButton>
                <div className="absolute right-1 bottom-1 flex gap-0.5">
                  <IconButton
                    label={`Move image ${index + 1} left`}
                    variant="overlay"
                    noTip
                    className="size-6"
                    disabled={saving || index === 0}
                    onClick={() => moveImage(index, -1)}
                  >
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Move image ${index + 1} right`}
                    variant="overlay"
                    noTip
                    className="size-6"
                    disabled={saving || index === values.images.length - 1}
                    onClick={() => moveImage(index, 1)}
                  >
                    <ChevronRight className="size-3.5" aria-hidden />
                  </IconButton>
                </div>
              </div>
            )}
          </SortableList>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            aria-label="Add preview images"
            className="sr-only"
            onChange={(e) => {
              addImages(e.target.files);
              e.target.value = "";
            }}
          />
        </section>

        <Field label="Description">
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={values.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              disabled={saving}
            />
          )}
        </Field>

        <Field label="Tags">
          {(control) => (
            <TagInput
              id={control.id}
              value={values.tags}
              onChange={(tags) => patch({ tags })}
              placeholder="Type a tag and press Enter"
              disabled={saving}
            />
          )}
        </Field>

        <section aria-labelledby="edit-files" className="border-t border-border pt-5">
          <h3 id="edit-files" className="mb-2 text-sm font-semibold text-fg">
            Model files
          </h3>
          <SortableList
            label="Model files"
            direction="vertical"
            items={values.plates}
            getId={plateKey}
            onReorder={(plates) => patch({ plates })}
            className="flex flex-col gap-2"
          >
            {(plate, index, drag) => (
              <div className="flex items-center gap-2 rounded-control border border-border px-2 py-1.5">
                <button
                  type="button"
                  {...drag.attributes}
                  {...drag.listeners}
                  aria-label={`Drag ${plate.name || "file"}`}
                  disabled={saving}
                  className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-subtle hover:bg-surface-2"
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
                <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
                <Input
                  aria-label={`File name ${index + 1}`}
                  value={plate.name}
                  onChange={(e) => renamePlate(plateKey(plate), e.target.value)}
                  disabled={saving}
                  aria-invalid={!plate.name.trim() || undefined}
                  className="h-8 min-w-0 flex-1"
                />
                {plate.kind === "new" ? <Badge tone="accent">New</Badge> : null}
                <IconButton
                  label={`Move ${plate.name} up`}
                  noTip
                  className={iconBtn}
                  disabled={saving || index === 0}
                  onClick={() => movePlate(index, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Move ${plate.name} down`}
                  noTip
                  className={iconBtn}
                  disabled={saving || index === values.plates.length - 1}
                  onClick={() => movePlate(index, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Remove ${plate.name}`}
                  variant="danger"
                  noTip
                  className={iconBtn}
                  disabled={saving || values.plates.length <= 1}
                  onClick={() => removePlate(plateKey(plate))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            )}
          </SortableList>
          {showErrors && errors.plates ? <p className="mt-1.5 text-xs text-danger">{errors.plates}</p> : null}
          <Button
            size="sm"
            className="mt-2"
            disabled={saving}
            icon={<Upload className="size-4" aria-hidden />}
            onClick={() => fileInput.current?.click()}
          >
            Add files
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            tabIndex={-1}
            aria-label="Add model files"
            className="sr-only"
            onChange={(e) => {
              addPlates(e.target.files);
              e.target.value = "";
            }}
          />
        </section>
      </form>
    </Modal>
  );
}

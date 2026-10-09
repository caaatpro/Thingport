import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Print } from "@/api/prints";
import { makePrint } from "@/features/prints/testUtils";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const api = vi.hoisted(() => ({
  updateMeta: vi.fn<AnyFn>(),
  updateCategory: vi.fn<AnyFn>(),
  setTags: vi.fn<AnyFn>(),
  resetAuthor: vi.fn<AnyFn>(),
  addPreviewImages: vi.fn<AnyFn>(),
  deletePreviewImage: vi.fn<AnyFn>(),
  reorderPreviewImages: vi.fn<AnyFn>(),
  addPlates: vi.fn<AnyFn>(),
  deletePlate: vi.fn<AnyFn>(),
  renamePlate: vi.fn<AnyFn>(),
  reorderPlates: vi.fn<AnyFn>(),
}));
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, ...api } };
});
vi.mock("@/api/categories", () => ({ categoriesApi: { list: vi.fn<AnyFn>().mockResolvedValue([]) } }));
vi.mock("@/app/auth", () => ({ useAuth: () => ({ user: { display_name: "Me", email: "me@example.test" }, token: "t" }) }));

const { default: EditModelModal } = await import("./EditModelModal");

const plate = (id: string, filename: string, position: number) => ({
  id,
  print_id: "p1",
  position,
  filename,
  mime: "model/stl",
  size: 10,
  url: `/p/${id}`,
});

const base = (overrides: Partial<Print> = {}) =>
  makePrint({
    notes: "old notes",
    tags: ["a"],
    plates: [plate("pl1", "benchy.stl", 0), plate("pl2", "lid.stl", 1)],
    ...overrides,
  });

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  URL.createObjectURL ??= () => "blob:test";
  URL.revokeObjectURL ??= () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockImplementation(async () => ({ print: base() }));
});

function open(print: Print = base()) {
  const onClose = vi.fn<AnyFn>();
  const view = renderWithProviders(<EditModelModal print={print} onClose={onClose} />);
  return { onClose, ...view };
}
const update = () => userEvent.click(screen.getByRole("button", { name: "Update" }));
const cancel = () => userEvent.click(within(screen.getByRole("dialog", { name: "Edit model" })).getByRole("button", { name: "Cancel" }));

describe("closing", () => {
  it("closes straight away when nothing changed", async () => {
    const { onClose } = open();
    await cancel();
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before discarding edits, and keeps the dialog if you decline", async () => {
    const { onClose } = open();
    await userEvent.type(screen.getByLabelText("Description"), " more");
    await cancel();
    const confirmDialog = await screen.findByRole("dialog", { name: "Are you sure?" });
    await userEvent.click(within(confirmDialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Description")).toHaveValue("old notes more");

    await cancel();
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Are you sure?" })).getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.updateMeta).not.toHaveBeenCalled();
  });

  it("is not dirty once a change is reverted", async () => {
    const { onClose } = open();
    const title = screen.getByLabelText("Title");
    await userEvent.type(title, "x");
    await userEvent.type(title, "{Backspace}");
    await cancel();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("validation", () => {
  it("won't save an empty title", async () => {
    open();
    await userEvent.clear(screen.getByLabelText("Title"));
    await update();
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(api.updateMeta).not.toHaveBeenCalled();
  });

  it("won't save a file with an empty name, and keeps at least one file", async () => {
    open(base({ plates: [plate("pl1", "benchy.stl", 0)] }));
    expect(screen.getByRole("button", { name: "Remove benchy.stl" })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("File name 1"));
    await update();
    expect(await screen.findByText("File names can't be empty.")).toBeInTheDocument();
    expect(api.renamePlate).not.toHaveBeenCalled();
  });
});

describe("roles", () => {
  it("shows category and author controls to the owner", () => {
    open(base({ source_provider: "makerworld", creator: "Someone" }));
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset author" })).toBeInTheDocument();
  });

  it("hides category and author from a collaborator and never sends them", async () => {
    const { onClose } = open(base({ is_owner: false, access_role: "edit", source_provider: "makerworld", creator: "Someone" }));
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset author" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Title"), " v2");
    await update();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.updateMeta).toHaveBeenCalledWith("p1", { title: "Benchy v2", notes: "old notes" });
    expect(api.updateCategory).not.toHaveBeenCalled();
    expect(api.resetAuthor).not.toHaveBeenCalled();
  });

  it("resets the author only when asked, and can undo", async () => {
    const { onClose } = open(base({ source_provider: "makerworld", creator: "Someone" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset author" }));
    expect(screen.getByText("You (after Update)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset author" }));
    await update();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.resetAuthor).toHaveBeenCalledTimes(1);
    expect(api.updateCategory).not.toHaveBeenCalled();
    expect(api.updateMeta).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  it("sends only what changed", async () => {
    const { onClose } = open();
    await userEvent.type(screen.getByLabelText("Tags"), "b{Enter}");
    await update();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.setTags).toHaveBeenCalledWith("p1", ["a", "b"]);
    expect(api.updateMeta).not.toHaveBeenCalled();
    expect(api.reorderPlates).not.toHaveBeenCalled();
  });

  it("stays open and says what failed when a step fails part-way, keeping what was saved", async () => {
    const saved = base({ title: "Renamed" });
    api.updateMeta.mockResolvedValue({ print: saved });
    api.setTags.mockRejectedValue(new Error("Tag service down"));
    const { onClose, queryClient } = open();
    const setData = vi.spyOn(queryClient, "setQueryData");
    await userEvent.type(screen.getByLabelText("Title"), "d");
    await userEvent.type(screen.getByLabelText("Tags"), "b{Enter}");
    await update();
    expect(await screen.findByText("Tag service down")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith(["print", "p1"], saved);
  });

  it("reports a failed preview-image upload but still saves the model files and closes", async () => {
    api.addPreviewImages.mockRejectedValue(new Error("Image too large"));
    api.reorderPlates.mockResolvedValue({ print: base() });
    const { onClose } = open();
    await userEvent.upload(screen.getByLabelText("Add preview images"), new File(["x"], "pic.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Move benchy.stl down" }));
    await update();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.reorderPlates).toHaveBeenCalledWith("p1", ["pl2", "pl1"]);
    expect(await screen.findByText("Image too large")).toBeInTheDocument();
  });
});

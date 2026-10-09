import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CollectionInput } from "@/api/collections";
import { renderWithProviders } from "@/test/render";
import { CollectionFormDialog } from "./CollectionFormDialog";

function setup(onSubmit = vi.fn<(input: CollectionInput) => Promise<void>>(async () => undefined)) {
  const onClose = vi.fn<() => void>();
  renderWithProviders(<CollectionFormDialog onClose={onClose} onSubmit={onSubmit} />);
  return { onSubmit, onClose };
}

describe("CollectionFormDialog", () => {
  it("cannot be submitted until the name has a non-space character", async () => {
    const { onSubmit } = setup();
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Name/), "   ");
    expect(create).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values, with an empty description as null, then closes", async () => {
    const { onSubmit, onClose } = setup();
    await userEvent.type(screen.getByLabelText(/Name/), "  Boxes  ");
    await userEvent.type(screen.getByPlaceholderText("Add tags"), "storage{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ name: "Boxes", description: null, tags: ["storage"] });
  });

  it("stays open and shows the server message when saving fails", async () => {
    const { onClose } = setup(vi.fn<(input: CollectionInput) => Promise<void>>(async () => Promise.reject(new Error("Name already used"))));
    await userEvent.type(screen.getByLabelText(/Name/), "Boxes");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name already used");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });
});

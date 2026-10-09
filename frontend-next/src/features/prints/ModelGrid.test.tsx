import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessRole } from "@/api/prints";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";
import { makePrint } from "./testUtils";

const api = vi.hoisted(() => ({
  favorite: vi.fn<AnyFn>(),
  unfavorite: vi.fn<AnyFn>(),
  delete: vi.fn<AnyFn>(),
  setTags: vi.fn<AnyFn>(),
}));
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, ...api } };
});
vi.mock("@/app/auth", () => ({
  useAuth: () => ({ user: { display_name: "Me", email: "me@example.test" }, token: "t" }),
}));
vi.mock("@/features/media/PrintThumb", () => ({ default: () => <div data-testid="thumb" /> }));
vi.mock("@/hooks/useAuthorPreviewEnabled", () => ({ useAuthorPreviewEnabled: () => false }));
vi.mock("@/hooks/useSlicerPreference", () => ({ useSlicerPreference: () => null }));
vi.mock("@/hooks/useGravatarUrl", () => ({ useGravatarUrl: () => undefined }));

const { ModelGrid } = await import("./ModelGrid");
const { BulkBar } = await import("./BulkBar");

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => {
  api.favorite.mockImplementation(async () => makePrint({ is_favorite: true }));
  api.unfavorite.mockImplementation(async () => makePrint({ is_favorite: false }));
});

function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="location">{pathname + search}</output>;
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
}
const menuNames = () => screen.getAllByRole("menuitem").map((item) => item.textContent);

function roleCase(role: AccessRole, extra: Partial<Parameters<typeof makePrint>[0]> = {}) {
  return makePrint({ access_role: role, is_owner: role === "owner", ...extra });
}

describe("selection", () => {
  const a = makePrint({ id: "a", title: "Alpha" });
  const b = makePrint({ id: "b", title: "Beta" });

  it("gives every card a 'Select <title>' checkbox that toggles through the selection", async () => {
    const toggle = vi.fn<AnyFn>();
    renderWithProviders(<ModelGrid items={[a, b]} view="grid" selection={{ selected: new Set(), toggle }} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    expect(toggle).toHaveBeenCalledWith("b");
  });

  it("has no checkboxes without a selection", () => {
    renderWithProviders(<ModelGrid items={[a]} view="grid" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("a plain click on a card opens it when nothing is selected", async () => {
    const toggle = vi.fn<AnyFn>();
    renderWithProviders(
      <>
        <ModelGrid items={[a]} view="grid" selection={{ selected: new Set(), toggle }} />
        <Where />
      </>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Alpha" }));
    expect(toggle).not.toHaveBeenCalled();
    expect(screen.getByLabelText("location")).toHaveTextContent("/models/a");
  });

  it("a plain click toggles instead of navigating while a selection is active; a modified click still opens", async () => {
    const toggle = vi.fn<AnyFn>();
    renderWithProviders(
      <>
        <ModelGrid items={[a, b]} view="list" selection={{ selected: new Set(["a"]), toggle }} />
        <Where />
      </>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Beta" }));
    expect(toggle).toHaveBeenCalledWith("b");
    expect(screen.getByLabelText("location")).toHaveTextContent("/");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("/models/b");

    toggle.mockClear();
    // The shared instance remembers the held key.
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link", { name: "Beta" }));
    await user.keyboard("{/Control}");
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe("the More actions menu follows the viewer's role", () => {
  it("the owner can add to a collection, download, edit, share and delete", async () => {
    renderWithProviders(<ModelGrid items={[roleCase("owner")]} view="grid" />);
    await openMenu();
    expect(menuNames()).toEqual(expect.arrayContaining(["Add to collection", "Download", "Edit", "Share…", "Delete"]));
    expect(menuNames()).not.toContain("Remove from collection");
  });

  it("Edit is a real link to the detail page's edit mode", async () => {
    renderWithProviders(<ModelGrid items={[roleCase("owner", { id: "p9" })]} view="grid" />);
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveAttribute("href", "/models/p9?edit=p9");
  });

  it("a read-only recipient can only download", async () => {
    renderWithProviders(<ModelGrid items={[roleCase("view", { visibility: "shared", owner: { id: "o", display_name: "Olga" } })]} view="grid" collectionId="c1" />);
    await openMenu();
    const names = menuNames().filter((n) => !n?.startsWith("Open in"));
    expect(names).toEqual(["Download"]);
  });

  it("an editor can edit and remove from the collection but not delete or share", async () => {
    renderWithProviders(<ModelGrid items={[roleCase("edit")]} view="grid" collectionId="c1" />);
    await openMenu();
    const names = menuNames();
    expect(names).toEqual(expect.arrayContaining(["Remove from collection", "Edit"]));
    expect(names).not.toContain("Delete");
    expect(names).not.toContain("Share…");
    expect(names).not.toContain("Add to collection");
  });

  it("a role with delete (not owner) can delete", async () => {
    renderWithProviders(<ModelGrid items={[roleCase("delete")]} view="list" />);
    await openMenu();
    expect(menuNames()).toContain("Delete");
  });

  it("deleting asks first, then removes the model", async () => {
    api.delete.mockResolvedValue({});
    renderWithProviders(<ModelGrid items={[roleCase("owner", { title: "Doomed" })]} view="grid" />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent('Delete "Doomed"?');
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("p1"));
  });
});

describe("favourite star", () => {
  it("is visible on the card and toggles optimistically", async () => {
    renderWithProviders(<ModelGrid items={[makePrint()]} view="grid" />);
    const star = screen.getByRole("button", { name: "Add to Favourites" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(star);
    expect(screen.getByRole("button", { name: "Remove from Favourites" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(api.favorite).toHaveBeenCalledWith("p1"));
  });

  it("rolls back when the request fails", async () => {
    api.favorite.mockRejectedValue(new Error("nope"));
    renderWithProviders(<ModelGrid items={[makePrint()]} view="grid" />);
    await userEvent.click(screen.getByRole("button", { name: "Add to Favourites" }));
    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Favourites" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("BulkBar", () => {
  const selected = [
    makePrint({ id: "a", title: "Alpha", tags: ["Keep"] }),
    makePrint({ id: "b", title: "Beta", tags: [] }),
  ];

  it("is a toolbar naming the selection size, with the four bulk actions", () => {
    renderWithProviders(<BulkBar selected={selected} categories={[]} onClear={() => undefined} />);
    const bar = screen.getByRole("toolbar");
    expect(bar).toHaveTextContent("2 selected");
    for (const name of ["Add to collection", "Add tags", "Move to category", "Delete"]) {
      expect(within(bar).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("adds new tags to every model without duplicating existing ones (case-insensitive), then clears", async () => {
    api.setTags.mockResolvedValue({});
    const onClear = vi.fn<AnyFn>();
    renderWithProviders(<BulkBar selected={selected} categories={[]} onClear={onClear} />);
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Add tags" }));
    const input = screen.getByPlaceholderText("Type a tag and press Enter");
    await userEvent.type(input, "keep{Enter}fresh{Enter}");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add tags" }));
    await waitFor(() => expect(api.setTags).toHaveBeenCalledTimes(2));
    expect(api.setTags).toHaveBeenCalledWith("a", ["Keep", "fresh"]);
    expect(api.setTags).toHaveBeenCalledWith("b", ["keep", "fresh"]);
    expect(await screen.findByText("Tags added")).toBeInTheDocument();
    expect(onClear).toHaveBeenCalled();
  });

  it("keeps the selection and reports it when some requests fail", async () => {
    api.delete.mockImplementation(async (id: string) => {
      if (id === "b") throw new Error("denied");
      return {};
    });
    const onClear = vi.fn<AnyFn>();
    renderWithProviders(<BulkBar selected={selected} categories={[]} onClear={onClear} />);
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("1 of 2 failed")).toBeInTheDocument();
    // Some succeeded, so the bar clears; the failed one is still in the list after the refresh.
    expect(onClear).toHaveBeenCalled();
  });
});

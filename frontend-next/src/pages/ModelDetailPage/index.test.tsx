import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Print } from "@/api/prints";
import { makePrint } from "@/features/prints/testUtils";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const api = vi.hoisted(() => ({
  get: vi.fn<AnyFn>(),
  listShares: vi.fn<AnyFn>(),
  setShares: vi.fn<AnyFn>(),
  updateMeta: vi.fn<AnyFn>(),
}));
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, ...api } };
});
vi.mock("@/api/users", () => ({ usersApi: { list: vi.fn<AnyFn>().mockResolvedValue([]) } }));
vi.mock("@/api/categories", () => ({ categoriesApi: { list: vi.fn<AnyFn>().mockResolvedValue([]) } }));
vi.mock("@/app/auth", () => ({ useAuth: () => ({ user: { display_name: "Me", email: "me@example.test" }, token: "t" }) }));
vi.mock("@/features/media/PrintThumb", () => ({ default: () => <div data-testid="hero-thumb" /> }));
vi.mock("@/features/media/PlateThumbnail", () => ({ default: () => <span /> }));
vi.mock("@/hooks/useAuthorPreviewEnabled", () => ({ useAuthorPreviewEnabled: () => false }));
vi.mock("@/hooks/useSlicerPreference", () => ({ useSlicerPreference: () => null }));
vi.mock("@/hooks/useGravatarUrl", () => ({ useGravatarUrl: () => undefined }));

const { default: ModelDetailPage } = await import("./index");

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

const plate = { id: "pl1", print_id: "p1", position: 0, filename: "Benchy.stl", mime: "m", size: 10, url: "/p/pl1" };
const model = (overrides: Partial<Print> = {}) =>
  makePrint({ plates: [plate], tags: ["boat", "test"], notes: "A boat.", ...overrides });

function Where() {
  const { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}
function show(print: Print, route = "/models/p1") {
  api.get.mockResolvedValue(print);
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/models/:printId" element={<ModelDetailPage />} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listShares.mockResolvedValue([]);
});

describe("ModelDetailPage", () => {
  it("shows the title, description and tags as real links", async () => {
    show(model());
    expect(await screen.findByRole("heading", { level: 1, name: "Benchy" })).toBeInTheDocument();
    expect(screen.getByText("A boat.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "boat" })).toHaveAttribute("href", "/models/tags/boat");
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/models");
    expect(screen.getByText("Benchy.stl")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download model files" })).toBeInTheDocument();
  });

  it("links category and source from the details panel", async () => {
    show(model({ category_id: "c1", category_name: "Toys", source_provider: "printables", source_url: "https://www.printables.com/model/1" }));
    expect(await screen.findByRole("link", { name: "Toys" })).toHaveAttribute("href", "/models?category=c1");
    expect(screen.getByRole("link", { name: /printables\.com\/model\/1/ })).toHaveAttribute("href", "https://www.printables.com/model/1");
  });

  it("offers Edit and Share to the owner, and the share dialog opens from either entry point", async () => {
    show(model());
    await screen.findByRole("heading", { level: 1, name: "Benchy" });
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/models/p1?edit=p1");

    await userEvent.click(screen.getByRole("button", { name: "Share…" }));
    expect(await screen.findByRole("dialog", { name: 'Share "Benchy"' })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Share/ }));
    expect(await screen.findByRole("dialog", { name: 'Share "Benchy"' })).toBeInTheDocument();
  });

  it("gives an editor Edit but not Share, and a viewer neither", async () => {
    const { unmount } = show(model({ is_owner: false, access_role: "edit" }));
    await screen.findByRole("heading", { level: 1, name: "Benchy" });
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share…" })).not.toBeInTheDocument();
    unmount();

    show(model({ is_owner: false, access_role: "view" }));
    await screen.findByRole("heading", { level: 1, name: "Benchy" });
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("opens the edit dialog from ?edit=<id> and removes the param when it closes", async () => {
    show(model(), "/models/p1?edit=p1");
    const dialog = await screen.findByRole("dialog", { name: "Edit model" });
    expect(screen.getByLabelText("search")).toHaveTextContent("?edit=p1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("search")).toBeEmptyDOMElement();
  });

  it("ignores ?edit for another id or without the edit role", async () => {
    show(model({ is_owner: false, access_role: "view" }), "/models/p1?edit=p1");
    await screen.findByRole("heading", { level: 1, name: "Benchy" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the 3D snapshot hero when there are no preview images, and the gallery when there are", async () => {
    const { unmount } = show(model());
    expect(await screen.findByTestId("hero-thumb")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3D Preview" })).toBeInTheDocument();
    unmount();

    show(model({ preview_images: [{ id: "i1", position: 1, url: "/i/1" }, { id: "i0", position: 0, url: "/i/0" }] }));
    await screen.findByRole("heading", { level: 1, name: "Benchy" });
    expect(screen.queryByTestId("hero-thumb")).not.toBeInTheDocument();
    const thumbs = screen.getAllByRole("button", { name: /Show image/ });
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute("aria-current", "true");
    await userEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getAllByRole("button", { name: /Show image/ })[1]).toHaveAttribute("aria-current", "true");
  });

  it("says so, with a retry, when the model can't be loaded", async () => {
    api.get.mockRejectedValueOnce(new Error("Not found"));
    show(model());
    api.get.mockRejectedValue(new Error("Not found"));
    expect(await screen.findByText("Couldn't load this model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

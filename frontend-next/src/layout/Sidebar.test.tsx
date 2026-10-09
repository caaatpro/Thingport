import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const state = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/app/auth", () => ({ useAuth: () => state }));
vi.mock("@/app/theme", () => ({ useTheme: () => ({ resolved: "light" }) }));
const bookmarksApi = vi.hoisted(() => ({ list: vi.fn<AnyFn>(), reorder: vi.fn<AnyFn>() }));
vi.mock("@/api/bookmarks", () => ({ bookmarksApi }));

const { Sidebar } = await import("./Sidebar");

const BOOKMARKS = [
  { id: "b1", type: "tag", tag: "Desk Stuff" },
  { id: "b2", type: "collection", collection_id: "c9", name: "Gridfinity" },
];

beforeEach(() => {
  state.isAdmin = false;
  bookmarksApi.list.mockResolvedValue(BOOKMARKS);
});

const current = () => screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");

describe("Sidebar", () => {
  it("marks the section you are in as current and shows the Library group", async () => {
    renderWithProviders(<Sidebar />, { route: "/models/collections/c9" });
    expect(screen.getByText("Library")).toBeInTheDocument();
    // The bookmark for this collection and the Collections section are both current; Models is not.
    expect(await screen.findByRole("link", { name: "Gridfinity" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Models" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Models current on a model page, and Tags only on the tag index", async () => {
    const { unmount } = renderWithProviders(<Sidebar />, { route: "/models/abc123" });
    expect(current().map((l) => l.textContent)).toEqual(["Models"]);
    unmount();
    renderWithProviders(<Sidebar />, { route: "/models/tags/Desk%20Stuff" });
    // Only the bookmark is current, not the Tags index.
    expect(await screen.findByRole("link", { name: "Desk Stuff" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tags" })).not.toHaveAttribute("aria-current");
  });

  it("links bookmarks to their pages, and Administration only for admins", async () => {
    const { unmount } = renderWithProviders(<Sidebar />);
    expect(await screen.findByRole("link", { name: "Desk Stuff" })).toHaveAttribute("href", "/models/tags/Desk%20Stuff");
    expect(screen.getByRole("link", { name: "Gridfinity" })).toHaveAttribute("href", "/models/collections/c9");
    expect(screen.queryByRole("link", { name: "Administration" })).toBeNull();
    unmount();
    state.isAdmin = true;
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  });

  it("collapses to an icon rail, keeps links reachable by name, and remembers the choice", async () => {
    const { unmount } = renderWithProviders(<Sidebar />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(window.localStorage.getItem("thingport.sidebar.collapsed")).toBe("true");
    expect(screen.getByRole("complementary")).toHaveAttribute("data-collapsed", "true");
    expect(await screen.findByRole("link", { name: "Gridfinity" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    unmount();

    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("complementary")).toHaveAttribute("data-collapsed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(window.localStorage.getItem("thingport.sidebar.collapsed")).toBe("false");
  });
});

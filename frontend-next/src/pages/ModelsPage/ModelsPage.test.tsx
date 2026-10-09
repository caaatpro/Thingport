import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/api/categories";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const api = vi.hoisted(() => ({ list: vi.fn<AnyFn>(), categories: vi.fn<AnyFn>() }));
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, list: api.list } };
});
vi.mock("@/api/categories", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/categories")>();
  return { ...original, categoriesApi: { ...original.categoriesApi, list: api.categories } };
});
vi.mock("@/app/auth", () => ({ useAuth: () => ({ user: { display_name: "Me", email: "me@example.test" }, token: "t" }) }));

const { default: ModelsPage } = await import("./index");

const cat = (id: string, name: string, parent_id: string | null = null, position = 0) =>
  ({ id, name, parent_id, position, tags: [], meta_title: null, meta_description: null, makerworld_cat_ids: "", thingiverse_cat_ids: "", printables_cat_ids: "" }) satisfies Category;

const CATEGORIES = [cat("toys", "Toys"), cat("cars", "Cars", "toys"), cat("tools", "Tools", null, 1)];

function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="location">{pathname + search}</output>;
}

beforeAll(() => {
  // A wide screen, so the categories show as the side column.
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  window.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords = () => [];
  } as unknown as typeof IntersectionObserver;
});
beforeEach(() => {
  api.list.mockReset().mockResolvedValue({ items: [], hasMore: false, total: 0 });
  api.categories.mockReset().mockResolvedValue(CATEGORIES);
});

const lastListCall = () => api.list.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("ModelsPage", () => {
  it("filters by the URL: the category's whole subtree, sort and scope", async () => {
    renderWithProviders(<ModelsPage />, { route: "/models?category=toys&sort=popular&scope=shared" });
    await screen.findByText("No models here");
    expect(lastListCall()).toMatchObject({ category_id: expect.arrayContaining(["toys", "cars"]), order_by: "popular", scope: "shared" });
    expect(screen.getByRole("heading", { level: 1, name: "Models" })).toBeInTheDocument();
  });

  it("links every category to /models?category=<id>, keeping sort and scope, and opens the selected branch", async () => {
    renderWithProviders(<ModelsPage />, { route: "/models?category=cars&sort=downloads" });
    const nav = await screen.findByRole("navigation", { name: "Categories" });
    expect(await within(nav).findByRole("link", { name: "Cars" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Tools" })).toHaveAttribute("href", "/models?category=tools&sort=downloads");
    expect(within(nav).getByRole("link", { name: "All" })).toHaveAttribute("href", "/models?sort=downloads");
  });

  it("writes scope and sort back to the URL and refetches", async () => {
    renderWithProviders(
      <>
        <ModelsPage />
        <Where />
      </>,
      { route: "/models?category=tools" },
    );
    await screen.findByText("No models here");
    await userEvent.click(screen.getByRole("radio", { name: "Shared with me" }));
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/models?category=tools&scope=shared"));
    await waitFor(() => expect(lastListCall()).toMatchObject({ scope: "shared", category_id: "tools" }));
    await userEvent.click(screen.getByRole("radio", { name: "Popular" }));
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("sort=popular"));
  });

  it("explains an empty library differently from an empty filter", async () => {
    renderWithProviders(<ModelsPage />, { route: "/models" });
    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    api.list.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<ModelsPage />, { route: "/models" });
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
  });
});

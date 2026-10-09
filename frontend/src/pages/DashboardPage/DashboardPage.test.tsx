import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardApi, type DashboardModel, type DashboardSummary } from "@/api/dashboard";
import { renderWithProviders } from "@/test/render";
import DashboardPage from ".";

const model = (id: string, name: string, extra: Partial<DashboardModel> = {}): DashboardModel => ({
  id,
  name,
  thumb_url: null,
  view_count: 3,
  print_count: 1,
  created_at: new Date().toISOString(),
  ...extra,
});

const EMPTY: DashboardSummary = {
  collection_count: 0,
  model_count: 0,
  author_count: 0,
  category_count: 0,
  top_viewed: [],
  top_printed: [],
  top_authors: [],
  top_providers: [],
  recently_added: [],
  recently_viewed: [],
  favorites: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(dashboardApi, "getTopViewed");
  vi.spyOn(dashboardApi, "getSummary");
});

describe("DashboardPage", () => {
  it("hides empty shelves but keeps Recently Added with its empty text", async () => {
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(EMPTY);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole("heading", { name: "Recently Added" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing added yet/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pick up where you left off" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Favorites" })).toBeNull();
  });

  it("links tiles and stats to their destinations", async () => {
    vi.mocked(dashboardApi.getSummary).mockResolvedValue({
      ...EMPTY,
      model_count: 12,
      author_count: 4,
      recently_viewed: [model("m1", "Phone stand")],
      favorites: [model("m2", "Benchy", { thumb_url: "/files/x.png" })],
    });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole("link", { name: /Phone stand/ })).toHaveAttribute("href", "/models/m1");
    expect(screen.getByRole("link", { name: /Benchy/ })).toHaveAttribute("href", "/models/m2");
    expect(screen.getByRole("link", { name: /12\s*Models/ })).toHaveAttribute("href", "/models");
    expect(screen.queryByRole("link", { name: /Unique authors/ })).toBeNull();
    expect(screen.getByText("Unique authors")).toBeInTheDocument();
  });

  it("shows the error text when loading fails", async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValue(new Error("boom"));
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("Failed to load your dashboard.")).toBeInTheDocument();
  });

  it("loads the full list lazily when 'See more' is opened", async () => {
    vi.mocked(dashboardApi.getSummary).mockResolvedValue({ ...EMPTY, top_viewed: [model("a", "Alpha")] });
    vi.mocked(dashboardApi.getTopViewed).mockResolvedValue([model("a", "Alpha"), model("b", "Bravo")]);
    renderWithProviders(<DashboardPage />);
    await screen.findByRole("link", { name: /Alpha/ });
    expect(dashboardApi.getTopViewed).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole("button", { name: "See more" })[0]);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveTextContent("Bravo"));
  });
});

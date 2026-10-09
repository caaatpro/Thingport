import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tagsApi, type TagSummary } from "@/api/tags";
import { renderWithProviders } from "@/test/render";
import TagsPage from ".";
import { filterTags } from "./filterTags";


const TAGS: TagSummary[] = [
  { name: "benchy", count: 5, bookmarked: false },
  { name: "Gridfinity", count: 3, bookmarked: true },
  { name: "rare", count: 1, bookmarked: false },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(tagsApi, "listSummary").mockResolvedValue(TAGS);
  vi.spyOn(tagsApi, "bookmark");
  vi.spyOn(tagsApi, "unbookmark");
});

describe("filterTags", () => {
  it("matches case-insensitively and hides tags used once on request", () => {
    expect(filterTags(TAGS, "GRID", false).map((t) => t.name)).toEqual(["Gridfinity"]);
    expect(filterTags(TAGS, "", true).map((t) => t.name)).toEqual(["benchy", "Gridfinity"]);
    expect(filterTags(TAGS, "rare", true)).toEqual([]);
  });
});

describe("TagsPage", () => {
  it("renders each tag as a real link with its count", async () => {
    renderWithProviders(<TagsPage />);
    expect(await screen.findByRole("link", { name: /benchy/ })).toHaveAttribute("href", "/models/tags/benchy");
    expect(screen.queryByRole("link", { name: /rare/ })).toBeNull();
  });

  it("filters by the box and can reveal rarely used tags", async () => {
    renderWithProviders(<TagsPage />);
    await screen.findByRole("link", { name: /benchy/ });
    await userEvent.type(screen.getByLabelText("Filter tags"), "grid");
    expect(screen.queryByRole("link", { name: /benchy/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Gridfinity/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Filter tags"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Hide tags used once" }));
    expect(await screen.findByRole("link", { name: /rare/ })).toBeInTheDocument();
  });

  it("bookmarks a tag and refreshes the sidebar's bookmarks", async () => {
    vi.mocked(tagsApi.bookmark).mockResolvedValue();
    const { queryClient } = renderWithProviders(<TagsPage />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(await screen.findByRole("button", { name: "Bookmark benchy" }));
    await waitFor(() => expect(tagsApi.bookmark).toHaveBeenCalledWith("benchy"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["bookmarks"] }));
  });

  it("removes an existing bookmark", async () => {
    vi.mocked(tagsApi.unbookmark).mockResolvedValue();
    renderWithProviders(<TagsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove bookmark for Gridfinity" }));
    await waitFor(() => expect(tagsApi.unbookmark).toHaveBeenCalledWith("Gridfinity"));
  });

  it("shows an empty state with no tags", async () => {
    vi.mocked(tagsApi.listSummary).mockResolvedValue([]);
    renderWithProviders(<TagsPage />);
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "@/api/collections";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const api = vi.hoisted(() => ({ get: vi.fn<AnyFn>(), upload: vi.fn<AnyFn>() }));
vi.mock("@/api/collections", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/collections")>();
  return { ...original, collectionsApi: { ...original.collectionsApi, get: api.get } };
});
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, upload: api.upload } };
});
vi.mock("@/features/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/prints")>();
  return {
    ...original,
    usePrintList: () => ({
      items: [],
      isLoading: false,
      isError: false,
      isFetchingNextPage: false,
      sentinelRef: { current: null },
      refetch: vi.fn<AnyFn>(),
    }),
  };
});

const { default: CollectionDetailPage } = await import("./index");

const base: Collection = {
  id: "c1",
  name: "Boxes",
  description: "Storage things",
  tags: [],
  item_count: 0,
  cover_items: [],
  created_at: "2026-01-01T00:00:00Z",
  system_key: null,
  bookmarked: false,
};

function show(collection: Collection) {
  api.get.mockResolvedValue(collection);
  return renderWithProviders(
    <Routes>
      <Route path="/models/collections/:collectionId" element={<CollectionDetailPage />} />
    </Routes>,
    { route: "/models/collections/c1" },
  );
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => {
  api.get.mockReset();
  api.upload.mockReset();
  api.upload.mockResolvedValue({ prints: [] });
});

async function menuItems() {
  await userEvent.click(await screen.findByRole("button", { name: "More" }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

describe("CollectionDetailPage", () => {
  it("gives the owner every action", async () => {
    show(base);
    expect(await screen.findByRole("heading", { name: "Boxes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload models" })).toBeVisible();
    expect(await menuItems()).toEqual(["Bookmark collection", "Download all as zip", "Edit", "Share…", "Delete"]);
  });

  it("shows a view-only member who shared it, with no upload, edit, share or delete", async () => {
    show({ ...base, is_owner: false, my_role: "view", owner: { id: "u1", display_name: "Ann" } });
    expect(await screen.findByText("Shared by Ann · Can view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload models" })).toBeNull();
    expect(await menuItems()).toEqual(["Bookmark collection", "Download all as zip"]);
  });

  it("lets an editor edit but not share or delete", async () => {
    show({ ...base, is_owner: false, my_role: "edit", owner: { id: "u1", display_name: "Ann" } });
    expect(await menuItems()).toEqual(["Bookmark collection", "Download all as zip", "Edit"]);
  });

  it("has no actions at all on a built-in collection", async () => {
    show({ ...base, id: "favorites", system_key: "favorites" });
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload models" })).toBeNull();
  });

  it("uploads each picked file separately into the collection and keeps going after a failure", async () => {
    api.upload.mockImplementation(async (files: File[]) => {
      if (files[0]?.name === "bad.stl") throw new Error("nope");
      return { prints: [] };
    });
    show(base);
    const input = await screen.findByTestId("collection-upload-input");
    const files = ["a.stl", "bad.stl", "c.stl"].map((n) => new File(["x"], n));
    await userEvent.upload(input, files);
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(3));
    expect(api.upload.mock.calls.map(([f, opts]) => [f.map((x: File) => x.name), opts])).toEqual([
      [["a.stl"], { collection_id: "c1" }],
      [["bad.stl"], { collection_id: "c1" }],
      [["c.stl"], { collection_id: "c1" }],
    ]);
    expect(await screen.findByText(/could not be uploaded: bad\.stl/)).toBeInTheDocument();
  });
});

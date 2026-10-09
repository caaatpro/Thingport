import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const searchApi = vi.hoisted(() => ({ search: vi.fn<AnyFn>() }));
vi.mock("@/api/search", () => ({ searchApi }));

const { GlobalSearch } = await import("./GlobalSearch");

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function setup() {
  return renderWithProviders(
    <Routes>
      <Route
        path="*"
        element={
          <>
            <GlobalSearch />
            <Where />
          </>
        }
      />
    </Routes>,
  );
}

const box = () => screen.getByRole("combobox", { name: "Search models, collections, tags…" });

beforeEach(() => {
  searchApi.search.mockReset();
  searchApi.search.mockResolvedValue({
    models: [
      { id: "m1", name: "phone-stand", title: "Phone stand", category_name: "Desk" },
      { id: "m2", name: "phone-case", title: null, category_name: null },
    ],
    collections: [{ id: "c1", name: "Phone gear", item_count: 1 }],
    tags: [{ tag: "phone mount", count: 3 }],
  });
});

describe("GlobalSearch", () => {
  it("groups results as real links and walks across the groups with the arrow keys", async () => {
    setup();
    await userEvent.type(box(), "phone");
    const first = await screen.findByRole("link", { name: /Phone stand/ });
    expect(first).toHaveAttribute("href", "/models/m1");
    expect(screen.getByRole("list", { name: "Collections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /phone mount/ })).toHaveAttribute("href", "/models/tags/phone%20mount");
    expect(first).toHaveAttribute("data-active");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("link", { name: /Phone gear/ })).toHaveAttribute("data-active");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    // Wraps around past the last result.
    expect(first).toHaveAttribute("data-active");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("link", { name: /phone mount/ })).toHaveAttribute("data-active");
  });

  it("opens the highlighted result on Enter and clears itself", async () => {
    setup();
    await userEvent.type(box(), "phone");
    await screen.findByRole("link", { name: /Phone gear/ });
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByTestId("where")).toHaveTextContent("/models/collections/c1");
    expect(box()).toHaveValue("");
    expect(screen.queryByRole("link", { name: /Phone gear/ })).toBeNull();
  });

  it("closes on Escape", async () => {
    setup();
    await userEvent.type(box(), "phone");
    await screen.findByRole("link", { name: /Phone stand/ });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: /Phone stand/ })).toBeNull();
  });

  it("says so when nothing matches, and does not search for a single character", async () => {
    searchApi.search.mockResolvedValue({ models: [], collections: [], tags: [] });
    setup();
    await userEvent.type(box(), "z");
    expect(searchApi.search).not.toHaveBeenCalled();
    await userEvent.type(box(), "zz");
    expect(await screen.findByText("No results for “zzz”.")).toBeInTheDocument();
  });

  it("is focused by Ctrl+K, and by / only when not typing in a field", async () => {
    renderWithProviders(
      <>
        <GlobalSearch />
        <input aria-label="Other field" />
      </>,
    );
    await userEvent.keyboard("/");
    expect(box()).toHaveFocus();
    await userEvent.click(screen.getByLabelText("Other field"));
    await userEvent.keyboard("/");
    expect(screen.getByLabelText("Other field")).toHaveFocus();
    expect(screen.getByLabelText("Other field")).toHaveValue("/");
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(box()).toHaveFocus();
  });
});

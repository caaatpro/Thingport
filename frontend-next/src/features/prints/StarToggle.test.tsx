import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";
import { StarToggle } from "./StarToggle";

describe("StarToggle", () => {
  it("is a toggle button with the given accessible name that reports clicks", async () => {
    const onClick = vi.fn<AnyFn>();
    renderWithProviders(<StarToggle active={false} onClick={onClick} label="Add to Favourites" />);
    const button = screen.getByRole("button", { name: "Add to Favourites" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reports the active state", () => {
    renderWithProviders(<StarToggle active onClick={() => undefined} label="Remove from Favourites" />);
    expect(screen.getByRole("button", { name: "Remove from Favourites" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does nothing when disabled", async () => {
    const onClick = vi.fn<AnyFn>();
    renderWithProviders(<StarToggle active onClick={onClick} disabled label="Favourite" />);
    const button = screen.getByRole("button", { name: "Favourite" });
    expect(button).toBeDisabled();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import StarToggle from "./StarToggle";
import type { AnyFn } from "../test/types";

describe("StarToggle", () => {
  it("is a button with the given accessible name that reports clicks", async () => {
    const onClick = vi.fn<AnyFn>();
    renderWithProviders(<StarToggle active={false} onClick={onClick} ariaLabel="Add to favourites" />);
    await userEvent.click(screen.getByRole("button", { name: "Add to favourites" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    const onClick = vi.fn<AnyFn>();
    renderWithProviders(<StarToggle active onClick={onClick} disabled ariaLabel="Favourite" />);
    const button = screen.getByRole("button", { name: "Favourite" });
    expect(button).toBeDisabled();
    // MUI disables pointer events on a disabled button; click anyway to prove the handler isn't wired.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

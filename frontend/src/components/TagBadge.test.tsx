import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import TagBadge from "./TagBadge";
import type { AnyFn } from "../test/types";

describe("TagBadge", () => {
  it("shows the tag without a remove control by default", () => {
    renderWithProviders(<TagBadge tag="storage" />);
    expect(screen.getByText("storage")).toBeInTheDocument();
    expect(screen.queryByLabelText(/remove/i)).toBeNull();
  });

  it("offers removal when a handler is given", async () => {
    const onRemove = vi.fn<AnyFn>();
    renderWithProviders(<TagBadge tag="storage" onRemove={onRemove} />);
    await userEvent.click(screen.getByLabelText(/remove/i));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { VisibilityBadge } from "./VisibilityBadge";

describe("VisibilityBadge", () => {
  it("says Private by default and Shared when shared", () => {
    const { rerender } = renderWithProviders(<VisibilityBadge />);
    expect(screen.getByText("Private")).toBeInTheDocument();
    rerender(<VisibilityBadge visibility="shared" />);
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("names the owner when someone else shared it with you", () => {
    renderWithProviders(<VisibilityBadge visibility="shared" ownerName="Anna" />);
    expect(screen.getByText("Shared by Anna")).toBeInTheDocument();
  });

  it("compact mode is an icon with the text only for assistive tech", () => {
    renderWithProviders(<VisibilityBadge visibility="shared" compact />);
    expect(screen.getByText("Shared")).toHaveClass("sr-only");
  });
});

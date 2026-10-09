import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import DownloadPage from ".";

describe("DownloadPage", () => {
  it("offers the zip and no browser-store links", () => {
    const { container } = renderWithProviders(<DownloadPage />);
    expect(screen.getByRole("link", { name: /Download \(\.zip\)/ })).toHaveAttribute(
      "href",
      "/downloads/thingport-grab-chrome.zip",
    );
    expect(
      container.querySelectorAll('a[href*="chromewebstore"], a[href*="addons.mozilla"], a[href*="microsoftedge"]'),
    ).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Downloads" })).toBeInTheDocument();
  });
});

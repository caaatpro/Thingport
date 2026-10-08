import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { useToast } from "./ToastProvider";

function Harness() {
  const showToast = useToast();
  return <button onClick={() => showToast({ message: "Saved it", severity: "success" })}>go</button>;
}

describe("useToast", () => {
  it("shows the message", async () => {
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByText("go"));
    expect(await screen.findByText("Saved it")).toBeInTheDocument();
  });

  it("throws a clear error outside a ToastProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
  });
});

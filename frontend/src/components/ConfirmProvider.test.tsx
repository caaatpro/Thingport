import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/render";
import { useConfirm } from "./ConfirmProvider";

function Harness({ destructive }: { destructive?: boolean }) {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button
        onClick={async () =>
          setAnswer(String(await confirm({ title: "Sure?", message: "This changes things.", destructive })))
        }
      >
        ask
      </button>
      <output>{answer}</output>
    </>
  );
}

describe("useConfirm", () => {
  it("resolves true when confirmed and shows the title and message", async () => {
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByText("ask"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Sure?");
    expect(screen.getByRole("dialog")).toHaveTextContent("This changes things.");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("true")).toBeInTheDocument();
  });

  it("resolves false when cancelled", async () => {
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByText("ask"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("false")).toBeInTheDocument();
  });

  it("a destructive confirmation says Delete", async () => {
    renderWithProviders(<Harness destructive />);
    await userEvent.click(screen.getByText("ask"));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

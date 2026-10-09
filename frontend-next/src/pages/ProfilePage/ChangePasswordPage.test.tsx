import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "@/api/auth";
import { renderWithProviders } from "@/test/render";
import ChangePasswordPage from "./ChangePasswordPage";
import { passwordProblem } from "./passwordRules";


beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(authApi, "updateProfile");
});

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/^Current password/), current);
  await userEvent.type(screen.getByLabelText(/^New password/), next);
  await userEvent.type(screen.getByLabelText(/^Confirm new password/), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Save password" }));
}

describe("passwordProblem", () => {
  it("checks length before match", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least 8/);
    expect(passwordProblem("longenough", "different1")).toBe("Passwords do not match");
    expect(passwordProblem("longenough", "longenough")).toBeNull();
  });
});

describe("ChangePasswordPage", () => {
  it("blocks mismatched passwords without calling the API", async () => {
    renderWithProviders(<ChangePasswordPage />);
    await fill("old-password", "new-password-1", "new-password-2");
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(authApi.updateProfile).not.toHaveBeenCalled();
  });

  it("sends the current password with the new one and clears the form", async () => {
    vi.mocked(authApi.updateProfile).mockResolvedValue({ user: {} as never });
    renderWithProviders(<ChangePasswordPage />);
    await fill("old-password", "new-password-1", "new-password-1");
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(authApi.updateProfile).toHaveBeenCalledWith({ current_password: "old-password", new_password: "new-password-1" });
    expect(screen.getByLabelText(/^Current password/)).toHaveValue("");
  });

  it("shows the server's message, such as a wrong current password", async () => {
    vi.mocked(authApi.updateProfile).mockRejectedValue(new Error("Current password is incorrect"));
    renderWithProviders(<ChangePasswordPage />);
    await fill("nope", "new-password-1", "new-password-1");
    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
  });
});

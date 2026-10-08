import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailNotVerifiedError } from "../../api/client";
import { renderWithProviders } from "../../test/render";
import type { AnyFn } from "../../test/types";

const authApi = vi.hoisted(() => ({ login: vi.fn<AnyFn>(), resendVerification: vi.fn<AnyFn>() }));
vi.mock("../../api/auth", () => ({ authApi }));

const { default: SignInPanel } = await import("./SignInPanel");

const user = { id: "u1", email: "me@example.test", display_name: "Me", role: "MEMBER" };

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/email/i), "me@example.test");
  await userEvent.type(screen.getByLabelText(/password/i), "hunter22");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

describe("SignInPanel", () => {
  it("signs in with the typed credentials and hands over the session", async () => {
    authApi.login.mockResolvedValue({ token: "tok", expires_in: 3600, user });
    const onSuccess = vi.fn<AnyFn>();
    renderWithProviders(<SignInPanel onSuccess={onSuccess} />);
    await fillAndSubmit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("tok", 3600, user));
    expect(authApi.login).toHaveBeenCalledWith("me@example.test", "hunter22");
  });

  it("shows the server's message for a refused login, such as a disabled account", async () => {
    authApi.login.mockRejectedValue(new Error("This account has been disabled. Ask an administrator."));
    const onSuccess = vi.fn<AnyFn>();
    renderWithProviders(<SignInPanel onSuccess={onSuccess} />);
    await fillAndSubmit();
    expect(await screen.findByText("This account has been disabled. Ask an administrator.")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("offers to resend the verification email when the account isn't verified yet", async () => {
    authApi.login.mockRejectedValue(new EmailNotVerifiedError("Please verify your email before signing in."));
    renderWithProviders(<SignInPanel onSuccess={vi.fn<AnyFn>()} />);
    await fillAndSubmit();
    expect(await screen.findByText("Please verify your email before signing in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend/i })).toBeInTheDocument();
  });

  it("only shows Forgot password when the instance can send email", () => {
    const { rerender } = renderWithProviders(<SignInPanel onSuccess={vi.fn<AnyFn>()} />);
    expect(screen.queryByText("Forgot password?")).toBeNull();
    rerender(<SignInPanel onSuccess={vi.fn<AnyFn>()} onForgotPassword={vi.fn<AnyFn>()} />);
    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
  });

  it("has no captcha field", () => {
    renderWithProviders(<SignInPanel onSuccess={vi.fn<AnyFn>()} />);
    expect(screen.queryByText(/captcha/i)).toBeNull();
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const authApi = vi.hoisted(() => ({ login: vi.fn<AnyFn>(), getInvitation: vi.fn<AnyFn>() }));
vi.mock("@/api/auth", () => ({ authApi }));

const auth = vi.hoisted(() => ({
  health: { ok: true, auth_required: true, allow_registrations: true, password_reset_enabled: false },
  login: vi.fn<AnyFn>(),
}));
vi.mock("@/app/auth", () => ({ useAuth: () => auth }));
vi.mock("@/app/theme", () => ({ useTheme: () => ({ resolved: "light" }) }));

const { default: AuthPage } = await import("./index");

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="*"
        element={
          <>
            <AuthPage />
            <Where />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  auth.health = { ok: true, auth_required: true, allow_registrations: true, password_reset_enabled: false };
  auth.login.mockReset();
});

describe("AuthPage", () => {
  it("offers Sign In and Register only while registrations are open", () => {
    const { unmount } = renderAt("/");
    expect(screen.getByRole("tab", { name: "Register" })).toBeInTheDocument();
    unmount();
    auth.health = { ...auth.health, allow_registrations: false };
    renderAt("/");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("opens an invitation on Register with the invited address locked, even when registrations are closed", async () => {
    auth.health = { ...auth.health, allow_registrations: false };
    authApi.getInvitation.mockResolvedValue({ email: "new@example.test", expires_at: "2099-01-01" });
    renderAt("/register?invite=abc&email=new%40example.test");
    expect(await screen.findByDisplayValue("new@example.test")).toBeDisabled();
    expect(authApi.getInvitation).toHaveBeenCalledWith("abc");
  });

  it("signs the user in and goes to the dashboard", async () => {
    const session = { token: "t", expires_in: 60, user: { id: "u" } };
    authApi.login.mockResolvedValue(session);
    renderAt("/some/deep/link");
    await userEvent.type(screen.getByLabelText(/^Email/), "me@example.test");
    await userEvent.type(screen.getByLabelText(/^Password/), "hunter22");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith(session));
    expect(screen.getByTestId("where")).toHaveTextContent("/");
  });
});

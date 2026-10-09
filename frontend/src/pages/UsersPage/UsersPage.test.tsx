import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/api/admin";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const adminApi = vi.hoisted(() => ({
  listUsers: vi.fn<AnyFn>(),
  updateUser: vi.fn<AnyFn>(),
  signOutUser: vi.fn<AnyFn>(),
  createResetLink: vi.fn<AnyFn>(),
  deleteUser: vi.fn<AnyFn>(),
  deleteAllPrintsForUser: vi.fn<AnyFn>(),
  createUser: vi.fn<AnyFn>(),
  inviteUser: vi.fn<AnyFn>(),
}));
const settingsApi = vi.hoisted(() => ({
  getRegistrations: vi.fn<AnyFn>(),
  getSmtp: vi.fn<AnyFn>(),
  updateRegistrations: vi.fn<AnyFn>(),
}));
vi.mock("@/api/admin", async (importOriginal) => ({ ...(await importOriginal<object>()), adminApi }));
vi.mock("@/api/settings", async (importOriginal) => ({ ...(await importOriginal<object>()), settingsApi }));

vi.mock("@/app/auth", () => ({ useUser: () => ({ id: "me" }) }));

const { default: UsersPage } = await import("./index");

const user = (overrides: Partial<AdminUser>): AdminUser => ({
  id: "x",
  email: "x@example.test",
  display_name: "X",
  role: "MEMBER",
  print_count: 0,
  collection_count: 0,
  storage_bytes: 0,
  api_token_count: 0,
  makerworld_connected: false,
  email_verified: true,
  disabled: false,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const users = [
  user({
    id: "me",
    email: "me@example.test",
    display_name: "Mia Admin",
    role: "ADMIN",
    print_count: 12,
    storage_bytes: 5 * 1024 * 1024,
    last_login_at: new Date().toISOString(),
  }),
  user({ id: "anna", email: "anna@example.test", display_name: "Anna Ivanova", print_count: 3, api_token_count: 2 }),
  user({ id: "boris", email: "boris@example.test", display_name: "Boris Petrov", disabled: true }),
  user({
    id: "clara",
    email: "clara@example.test",
    display_name: "Clara Schmidt",
    role: "ADMIN",
    email_verified: false,
  }),
];

function renderPage() {
  return renderWithProviders(<UsersPage />);
}

async function openMenuFor(name: string) {
  const row = (await screen.findByText(name)).closest("tr")!;
  await userEvent.click(within(row).getByLabelText("User actions"));
  return screen.findByRole("menu");
}

beforeEach(() => {
  adminApi.listUsers.mockResolvedValue(users);
  adminApi.updateUser.mockResolvedValue({ ok: true });
  adminApi.signOutUser.mockResolvedValue({ ok: true, revoked_tokens: 0 });
  adminApi.createResetLink.mockResolvedValue({
    url: "http://host/reset-password?token=abc",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  adminApi.deleteUser.mockResolvedValue({ ok: true, deleted_models: 3 });
  adminApi.createUser.mockResolvedValue({ id: "new", email: "new@example.test", generated_password: "Gen3rated-Pass" });
  settingsApi.getRegistrations.mockResolvedValue({ allow_registrations: true });
  settingsApi.getSmtp.mockResolvedValue({ configured: false });
});

describe("UsersPage", () => {
  it("lists every account with its role and status, and a summary", async () => {
    renderPage();
    expect(await screen.findByText("Anna Ivanova")).toBeInTheDocument();
    expect(screen.getByText("4 users · 2 admins · 1 disabled")).toBeInTheDocument();
    const boris = screen.getByText("Boris Petrov").closest("tr")!;
    expect(within(boris).getByText("Disabled")).toBeInTheDocument();
    const clara = screen.getByText("Clara Schmidt").closest("tr")!;
    expect(within(clara).getByText("Email not verified")).toBeInTheDocument();
    expect(within(screen.getByText("Mia Admin").closest("tr")!).getByText("You")).toBeInTheDocument();
  });

  it("shows how much each person stores and when they were last active", async () => {
    renderPage();
    const me = (await screen.findByText("Mia Admin")).closest("tr")!;
    expect(within(me).getByText("5.0 MB")).toBeInTheDocument();
    expect(within(me).getByText(/now|minute|today/i)).toBeInTheDocument();
    expect(within(screen.getByText("Anna Ivanova").closest("tr")!).getByText("Never")).toBeInTheDocument();
  });

  it("searches by name or email", async () => {
    renderPage();
    await screen.findByText("Anna Ivanova");
    await userEvent.type(screen.getByPlaceholderText("Search by name or email…"), "boris@");
    expect(screen.queryByText("Anna Ivanova")).toBeNull();
    expect(screen.getByText("Boris Petrov")).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("Search by name or email…"));
    await userEvent.type(screen.getByPlaceholderText("Search by name or email…"), "nobody-here");
    expect(screen.getByText("No users match.")).toBeInTheDocument();
  });

  it("filters by role and by disabled accounts", async () => {
    renderPage();
    await screen.findByText("Anna Ivanova");
    await userEvent.click(screen.getByRole("radio", { name: "Admins" }));
    expect(screen.queryByText("Anna Ivanova")).toBeNull();
    expect(screen.getByText("Clara Schmidt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Disabled" }));
    expect(screen.queryByText("Clara Schmidt")).toBeNull();
    expect(screen.getByText("Boris Petrov")).toBeInTheDocument();
  });

  it("promotes a member to administrator", async () => {
    renderPage();
    const menu = await openMenuFor("Anna Ivanova");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Make administrator" }));
    await waitFor(() => expect(adminApi.updateUser).toHaveBeenCalledWith("anna", { role: "ADMIN" }));
    expect(adminApi.listUsers).toHaveBeenCalledTimes(2); // reloaded after the change
  });

  it("offers an administrator the opposite action", async () => {
    renderPage();
    const menu = await openMenuFor("Clara Schmidt");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Make regular member" }));
    await waitFor(() => expect(adminApi.updateUser).toHaveBeenCalledWith("clara", { role: "MEMBER" }));
  });

  it("gives you no way to demote, disable or delete yourself", async () => {
    renderPage();
    const menu = await openMenuFor("Mia Admin");
    expect(within(menu).queryByRole("menuitem", { name: /make regular member|make administrator/i })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: /disable account|enable account/i })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Delete user…" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Edit name…" })).toBeInTheDocument();
  });

  it("asks before disabling an account, and disables it on confirm", async () => {
    renderPage();
    const menu = await openMenuFor("Anna Ivanova");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Disable account" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Disable Anna Ivanova?");
    expect(adminApi.updateUser).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(adminApi.updateUser).toHaveBeenCalledWith("anna", { disabled: true }));
  });

  it("does nothing when the disable confirmation is cancelled", async () => {
    renderPage();
    const menu = await openMenuFor("Anna Ivanova");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Disable account" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(adminApi.updateUser).not.toHaveBeenCalled();
  });

  it("enables a disabled account straight away", async () => {
    renderPage();
    const menu = await openMenuFor("Boris Petrov");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Enable account" }));
    await waitFor(() => expect(adminApi.updateUser).toHaveBeenCalledWith("boris", { disabled: false }));
  });

  it("deleting a user needs their email typed in", async () => {
    renderPage();
    const menu = await openMenuFor("Anna Ivanova");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Delete user…" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete user" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Type anna@example\.test to confirm/), "ANNA@example.test");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(adminApi.deleteUser).toHaveBeenCalledWith("anna"));
  });

  it("hands out a password reset link", async () => {
    renderPage();
    const menu = await openMenuFor("Anna Ivanova");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Password reset link…" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(adminApi.createResetLink).toHaveBeenCalledWith("anna"));
    expect(await within(dialog).findByDisplayValue("http://host/reset-password?token=abc")).toBeInTheDocument();
  });

  it("signs a user out everywhere and can also revoke their API tokens", async () => {
    adminApi.signOutUser.mockResolvedValue({ ok: true, revoked_tokens: 2 });
    renderPage();
    const menu = await openMenuFor("Anna Ivanova");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Sign out everywhere…" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText("Also revoke their API tokens (2)"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(adminApi.signOutUser).toHaveBeenCalledWith("anna", true));
  });

  it("only offers token revocation to someone who has tokens", async () => {
    renderPage();
    const menu = await openMenuFor("Clara Schmidt");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Sign out everywhere…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/revoke their API tokens/)).toBeNull();
  });

  it("deleting all of someone's models is greyed out when they have none", async () => {
    renderPage();
    const menu = await openMenuFor("Clara Schmidt");
    expect(within(menu).getByRole("menuitem", { name: "Delete all models…" })).toHaveAttribute("aria-disabled", "true");
  });

  it("creates a user and shows the generated password once", async () => {
    renderPage();
    await screen.findByText("Anna Ivanova");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Email/), "new@example.test");
    await userEvent.type(within(dialog).getByLabelText(/^Name/), "New Person");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
    await waitFor(() =>
      expect(adminApi.createUser).toHaveBeenCalledWith({
        email: "new@example.test",
        display_name: "New Person",
        role: "MEMBER",
      }),
    );
    expect(await within(dialog).findByDisplayValue("Gen3rated-Pass")).toBeInTheDocument();
  });

  it("explains a refusal from the server inside the form", async () => {
    adminApi.createUser.mockRejectedValue(new Error("That email is already in use."));
    renderPage();
    await screen.findByText("Anna Ivanova");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Email/), "anna@example.test");
    await userEvent.type(within(dialog).getByLabelText(/^Name/), "Dup");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
    expect(await within(dialog).findByText("That email is already in use.")).toBeInTheDocument();
  });

  it("won't submit a password shorter than eight characters", async () => {
    renderPage();
    await screen.findByText("Anna Ivanova");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Email/), "n@example.test");
    await userEvent.type(within(dialog).getByLabelText(/^Name/), "N");
    await userEvent.type(within(dialog).getByLabelText(/^Password/), "short");
    expect(within(dialog).getByRole("button", { name: "Create user" })).toBeDisabled();
  });
});

import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER, apiJson, readSeed } from "./helpers";

// These start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

async function signInWith(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("the sign-in form asks for no captcha", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/captcha/i)).toHaveCount(0);
});

test("signs in with the right password and lands on the dashboard", async ({ page }) => {
  await signInWith(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await expect(page.getByText("Administration")).toBeVisible();
});

test("a member signs in but sees no administration section", async ({ page }) => {
  await signInWith(page, MEMBER.email, MEMBER.password);
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await expect(page.getByText("Administration")).toHaveCount(0);
});

test("a wrong password is refused with a clear message", async ({ page }) => {
  await signInWith(page, ADMIN.email, "definitely-not-it");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("a disabled account is told so, and can sign in again once re-enabled", async ({ page, request }) => {
  const { adminToken } = readSeed();
  const email = `disabled-${Date.now()}@e2e.test`;
  const created = await apiJson<{ id: string }>(request, "post", "/api/admin/users", adminToken, {
    email,
    display_name: "Soon Disabled",
    password: "E2e-disabled-pass-1",
  });
  await apiJson(request, "patch", `/api/admin/users/${created.id}`, adminToken, { disabled: true });

  await signInWith(page, email, "E2e-disabled-pass-1");
  await expect(page.getByText(/account has been disabled/i)).toBeVisible();

  await apiJson(request, "patch", `/api/admin/users/${created.id}`, adminToken, { disabled: false });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
});

test("signing out returns to the sign-in form", async ({ page }) => {
  await signInWith(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await page.getByLabel("User actions").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

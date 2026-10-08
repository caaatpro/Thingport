import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER, apiJson, readSeed } from "./helpers";

test("the administration home summarises users and the library", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Library", { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+ models/)).toBeVisible();
  await expect(page.getByText(/active this week/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Users/ }).first()).toHaveAttribute("href", "/admin-users");
});

test("the users page lists the accounts with their roles", async ({ page }) => {
  await page.goto("/admin-users");
  const admin = page.getByRole("row").filter({ hasText: ADMIN.email });
  await expect(admin).toContainText("Admin");
  await expect(admin).toContainText("You");
  await expect(page.getByRole("row").filter({ hasText: MEMBER.email })).toContainText("Member");
});

test("an admin adds a user with a generated password who can then sign in", async ({ page, browser }) => {
  const email = `added-${Date.now()}@e2e.test`;
  await page.goto("/admin-users");
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Email/).fill(email);
  await dialog.getByLabel(/^Name/).fill("Added By Admin");
  await dialog.getByRole("button", { name: "Create user" }).click();

  const generated = dialog.locator("input[readonly]");
  await expect(generated).toBeVisible();
  const password = await generated.inputValue();
  expect(password.length).toBeGreaterThanOrEqual(12);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible();

  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await fresh.newPage();
  await other.goto("/");
  await other.getByLabel(/^Email/).fill(email);
  await other.getByLabel(/^Password/).fill(password);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await fresh.close();
});

test("disabling an account marks it and cuts the user off at once", async ({ page, browser, request }) => {
  const { adminToken } = readSeed();
  const email = `cutoff-${Date.now()}@e2e.test`;
  await apiJson(request, "post", "/api/admin/users", adminToken, {
    email,
    display_name: "Cut Off",
    password: "E2e-cutoff-pass-1",
  });
  const victimCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const victim = await victimCtx.newPage();
  await victim.goto("/");
  await victim.getByLabel(/^Email/).fill(email);
  await victim.getByLabel(/^Password/).fill("E2e-cutoff-pass-1");
  await victim.getByRole("button", { name: "Sign in" }).click();
  await expect(victim.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

  await page.goto("/admin-users");
  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: "Disable account" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(row).toContainText("Disabled");

  // Their open session stops working on the next request, no waiting for it to expire.
  await victim.goto("/models");
  await expect(victim.getByRole("button", { name: "Sign in" })).toBeVisible();
  await victimCtx.close();

  await row.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: "Enable account" }).click();
  await expect(row).toContainText("Active");
});

test("a password reset link can be created for a user", async ({ page }) => {
  await page.goto("/admin-users");
  const row = page.getByRole("row").filter({ hasText: MEMBER.email });
  await row.getByLabel("User actions").click();
  await page.getByRole("menuitem", { name: "Password reset link…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("input[readonly]")).toHaveValue(/\/reset-password\?token=/);
});

test("an admin cannot demote, disable or delete themselves from the menu", async ({ page }) => {
  await page.goto("/admin-users");
  await page.getByRole("row").filter({ hasText: ADMIN.email }).getByLabel("User actions").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Edit name…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Make regular member|Disable account|Delete user/ })).toHaveCount(0);
});

test.describe("as a member", () => {
  test.use({ storageState: "e2e/.auth/member.json" });

  test("the administration pages are out of reach", async ({ page }) => {
    await page.goto("/admin-users");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Administration")).toHaveCount(0);
  });

  test("the admin API refuses a member's token", async ({ request }) => {
    const { memberToken } = readSeed();
    const res = await request.get("/api/admin/users", { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(res.status()).toBe(403);
  });
});

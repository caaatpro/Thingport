import { expect, test } from "@playwright/test";
import { collectPageErrors } from "./helpers";

// Every main screen opens, shows its heading and stays quiet in the console.
const PAGES: [name: string, path: string, heading: RegExp][] = [
  ["dashboard", "/", /Dashboard/],
  ["models", "/models", /^Models$/],
  ["collections", "/models/collections", /Collections/],
  ["tags", "/models/tags", /Tags/],
  ["downloads", "/downloads", /Downloads/],
  ["profile", "/profile", /Profile/],
  ["administration", "/admin", /Administration/],
  ["users", "/admin-users", /Users/],
  ["settings", "/admin-settings", /Admin Settings/],
  ["logs", "/admin-logs", /Logs/],
  ["triggers", "/admin-triggers", /Triggers/],
  ["connections", "/admin-connections", /Connections/],
];

for (const [name, path, heading] of PAGES) {
  test(`${name} page opens without errors`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("an unknown address goes back to the dashboard", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page).toHaveURL(/\/$/);
});

test("the downloads page offers the extension and no browser-store links", async ({ page }) => {
  await page.goto("/downloads");
  await expect(page.getByRole("link", { name: /Download \(\.zip\)/ })).toHaveAttribute(
    "href",
    "/downloads/thingport-grab-chrome.zip",
  );
  await expect(
    page.locator('a[href*="chromewebstore"], a[href*="addons.mozilla"], a[href*="microsoftedge"]'),
  ).toHaveCount(0);
});

test("English is the only language: no language picker on the profile page", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: /Profile/ }).first()).toBeVisible();
  await expect(page.getByText(/Lietuvi|Language/i)).toHaveCount(0);
});

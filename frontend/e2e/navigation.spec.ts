import { expect, test } from "@playwright/test";
import { readSeed } from "./helpers";

test("cards and menus are real links, so they open in a new tab", async ({ page }) => {
  const { models } = readSeed();
  await page.goto("/models");
  await expect(page.getByRole("link", { name: models[0].title, exact: true }).first()).toHaveAttribute(
    "href",
    new RegExp(`/models/${models[0].id}$`),
  );
  for (const [name, href] of [
    ["Dashboard", "/"],
    ["Models", "/models"],
    ["Collections", "/models/collections"],
    ["Tags", "/models/tags"],
    ["Downloads", "/downloads"],
  ] as const) {
    await expect(page.getByRole("link", { name, exact: true }).first()).toHaveAttribute("href", href);
  }
});

test("a modified click on a model opens it in a new tab and leaves this page alone", async ({ page, context }) => {
  const { models } = readSeed();
  await page.goto("/models");
  const popup = context.waitForEvent("page");
  await page
    .getByRole("link", { name: models[0].title, exact: true })
    .first()
    .click({ modifiers: ["ControlOrMeta"] });
  const tab = await popup;
  await expect(tab).toHaveURL(new RegExp(`/models/${models[0].id}$`));
  await expect(page).toHaveURL(/\/models$/);
});

test("dashboard tiles and search results are links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Models/ }).first()).toBeVisible();
  await page.getByPlaceholder(/Search models/).fill("Phone");
  await expect(page.getByRole("link", { name: /Phone stand/ }).first()).toHaveAttribute("href", /\/models\/.+/);
});

test("a model page does not scroll sideways", async ({ page }) => {
  const { models } = readSeed();
  await page.goto(`/models/${models[0].id}`);
  await expect(page.getByText(`${models[0].title}.stl`).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

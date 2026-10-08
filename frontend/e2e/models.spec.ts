import { expect, test, type Page } from "@playwright/test";
import { apiJson, collectPageErrors, readSeed, stlBox, unique } from "./helpers";

const card = (page: Page, title: string) => page.getByText(title, { exact: true }).first();

test("the library shows the seeded models", async ({ page }) => {
  const { models } = readSeed();
  await page.goto("/models");
  for (const { title } of models) await expect(card(page, title)).toBeVisible();
});

test("a model's page shows its title and files", async ({ page }) => {
  const errors = collectPageErrors(page);
  const { models } = readSeed();
  await page.goto("/models");
  await page.getByRole("link", { name: models[1].title, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/models/${models[1].id}`));
  await expect(page.getByText(`${models[1].title}.stl`).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("global search finds a model by name", async ({ page }) => {
  await page.goto("/models");
  await page.getByPlaceholder(/Search models/).fill("Phone");
  await expect(page.getByRole("link", { name: "Phone stand" }).first()).toBeVisible();
  await page.getByPlaceholder(/Search models/).fill("zzz-no-such-thing");
  await expect(page.getByText(/No results for/)).toBeVisible();
});

test("renaming a model is saved", async ({ page, request }) => {
  const { adminToken } = readSeed();
  const upload = await request.post("/api/upload", {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: { files: { name: "rename-me.stl", mimeType: "model/stl", buffer: Buffer.from(stlBox("rename")) } },
  });
  const id = ((await upload.json()) as { prints: { id: string }[] }).prints[0].id;
  const renamed = unique("After rename");
  await apiJson(request, "post", `/api/print/${id}/meta`, adminToken, { title: unique("Before rename") });

  await page.goto(`/models/${id}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").first().fill(renamed);
  await dialog.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText(renamed).first()).toBeVisible();

  await page.reload();
  await expect(page.getByText(renamed).first()).toBeVisible();
});

test("uploading a file adds a model to the library", async ({ page }) => {
  await page.goto("/models");
  const name = `uploaded-${Date.now()}`;
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Add$/ }).click();
  await page.getByRole("menuitem", { name: "Upload" }).click();
  await (await chooser).setFiles({ name: `${name}.stl`, mimeType: "model/stl", buffer: Buffer.from(stlBox(name)) });
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
});

test("a model can be deleted after confirming", async ({ page, request }) => {
  const { adminToken } = readSeed();
  const upload = await request.post("/api/upload", {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: { files: { name: "delete-me.stl", mimeType: "model/stl", buffer: Buffer.from(stlBox("del")) } },
  });
  const id = ((await upload.json()) as { prints: { id: string }[] }).prints[0].id;
  const doomed = unique("Delete me please");
  await apiJson(request, "post", `/api/print/${id}/meta`, adminToken, { title: doomed });

  await page.goto(`/models/${id}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText(doomed);
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).not.toHaveURL(new RegExp(id));
  await page.goto("/models");
  await expect(page.getByText(doomed)).toHaveCount(0);
});

test("the empty state for a category with nothing in it explains itself", async ({ page }) => {
  await page.goto("/models?scope=shared");
  await expect(page.getByText(/Nothing shared with you yet|Shared by/)).toBeVisible();
});

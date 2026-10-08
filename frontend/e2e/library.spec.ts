import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiJson, authHeader, readSeed, stlBox, unique } from "./helpers";

async function uploadModel(request: APIRequestContext, token: string, title: string): Promise<string> {
  const upload = await request.post("/api/upload", {
    headers: authHeader(token),
    multipart: { files: { name: `${title}.stl`, mimeType: "model/stl", buffer: Buffer.from(stlBox(title)) } },
  });
  const id = ((await upload.json()) as { prints: { id: string }[] }).prints[0].id;
  await apiJson(request, "post", `/api/print/${id}/meta`, token, { title });
  return id;
}

test("the list view is remembered across reloads", async ({ page }) => {
  await page.goto("/models");
  await page.getByRole("button", { name: "List" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Grid" }).click();
  await expect(page.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
});

test("selected models get tags in bulk, then can be deleted together", async ({ page, request }) => {
  const { adminToken } = readSeed();
  const a = unique("Bulk A");
  const b = unique("Bulk B");
  const [idA, idB] = [await uploadModel(request, adminToken, a), await uploadModel(request, adminToken, b)];
  const tag = `Bulk${Date.now().toString(36)}`;

  await page.goto("/models");
  await page.getByRole("checkbox", { name: `Select ${a}` }).check();
  await page.getByRole("checkbox", { name: `Select ${b}` }).check();
  const bar = page.getByRole("toolbar");
  await expect(bar).toContainText("2 selected");

  await bar.getByRole("button", { name: "Add tags" }).click();
  await page.getByPlaceholder("Type a tag and press Enter").fill(tag);
  await page.getByPlaceholder("Type a tag and press Enter").press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Add tags" }).click();
  await expect(page.getByText("Tags added")).toBeVisible();
  for (const id of [idA, idB]) {
    const print = (await (await request.get(`/api/print/${id}`, { headers: authHeader(adminToken) })).json()) as {
      tags: string[];
    };
    expect(print.tags).toContain(tag);
  }

  await page.getByRole("checkbox", { name: `Select ${a}` }).check();
  await page.getByRole("checkbox", { name: `Select ${b}` }).check();
  await page.getByRole("toolbar").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(a, { exact: true })).toHaveCount(0);
  expect((await request.get(`/api/print/${idA}`, { headers: authHeader(adminToken) })).status()).toBe(404);
});

test("the dashboard offers models you opened and starred", async ({ page, request }) => {
  const { adminToken } = readSeed();
  const title = unique("Shelf model");
  const id = await uploadModel(request, adminToken, title);
  await request.post(`/api/print/${id}/favorite`, { headers: authHeader(adminToken) });
  await page.goto(`/models/${id}`);
  await expect(page.getByText(title).first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
});

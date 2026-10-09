import { expect, test } from "@playwright/test";
import { apiJson, readSeed, stlBox, unique } from "./helpers";

async function shareWithMember(request: Parameters<typeof apiJson>[0], role: string) {
  const { adminToken, memberId, collection } = readSeed();
  await apiJson(request, "put", `/api/collection/${collection.id}/shares`, adminToken, {
    shares: [{ user_id: memberId, role }],
  });
  return collection;
}

test.describe("as a member the collection was shared with", () => {
  test.use({ storageState: "e2e/.auth/member.json" });

  test("an uploader sees the upload button and can add a model", async ({ page, request }) => {
    const collection = await shareWithMember(request, "upload");
    await page.goto(`/models/collections/${collection.id}`);
    await expect(page.getByText(/Shared by .* · Can upload/)).toBeVisible();
    const name = unique("member-upload").replace(/\s/g, "-");
    await page.getByTestId("collection-upload-input").setInputFiles({
      name: `${name}.stl`,
      mimeType: "model/stl",
      buffer: Buffer.from(stlBox(name)),
    });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
  });

  test("a viewer can look but not upload or edit", async ({ page, request }) => {
    const collection = await shareWithMember(request, "view");
    await page.goto(`/models/collections/${collection.id}`);
    await expect(page.getByText(/Shared by .* · Can view/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload models" })).toHaveCount(0);
    await page.getByRole("button", { name: "More" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  });
});

test("the owner picks a permission per person in the share dialog", async ({ page, request }) => {
  const { collection, adminToken } = readSeed();
  // Start from "shared with nobody" so the dialog's click selects the member rather than clearing them.
  await apiJson(request, "put", `/api/collection/${collection.id}/shares`, adminToken, { shares: [] });
  await page.goto(`/models/collections/${collection.id}`);
  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("menuitem", { name: /Share/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("E2E Member").click();
  const select = dialog.getByRole("combobox", { name: "Permission for E2E Member" });
  await expect(select).toBeVisible();
  await select.click();
  await page.getByRole("option", { name: "Can edit" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
});

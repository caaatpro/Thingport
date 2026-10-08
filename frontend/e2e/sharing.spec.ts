import { expect, test } from "@playwright/test";
import { MEMBER, apiJson, readSeed, stlBox, unique } from "./helpers";

test("sharing a model with a member makes it appear under 'Shared with me' for them", async ({
  page,
  browser,
  request,
}) => {
  const { adminToken, memberId } = readSeed();
  const upload = await request.post("/api/upload", {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: { files: { name: "share-me.stl", mimeType: "model/stl", buffer: Buffer.from(stlBox("share")) } },
  });
  const id = ((await upload.json()) as { prints: { id: string }[] }).prints[0].id;
  const title = unique("Shared by dialog");
  await apiJson(request, "post", `/api/print/${id}/meta`, adminToken, { title });

  await page.goto(`/models/${id}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: /Share/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Private — only you can see this/)).toBeVisible();
  await dialog.getByText(MEMBER.name).click();
  await expect(dialog.getByText("Shared with 1 person.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const memberCtx = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const member = await memberCtx.newPage();
  await member.goto("/models?scope=shared");
  await expect(member.getByText(title)).toBeVisible();
  // Read-only for them: the page opens but offers no edit.
  await member.goto(`/models/${id}`);
  await expect(member.getByText(title).first()).toBeVisible();
  const res = await member.request.delete(`/api/print/${id}`, {
    headers: {
      Authorization: `Bearer ${(await member.evaluate(() => localStorage.getItem("thingport_auth_token")))!}`,
    },
  });
  expect(res.status()).toBe(404);
  await memberCtx.close();
  expect(memberId).toBeTruthy();
});

test("sharing a collection shares the models in it, including ones added later", async ({ browser, request }) => {
  const { adminToken, memberId, collection } = readSeed();
  const later = unique("Added to the shared collection later");
  await apiJson(request, "put", `/api/collection/${collection.id}/shares`, adminToken, { user_ids: [memberId] });

  const memberCtx = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const member = await memberCtx.newPage();
  await member.goto(`/models/collections/${collection.id}`);
  await expect(member.getByText(collection.modelTitle)).toBeVisible();

  // A model added to the collection afterwards shows up without sharing anything again.
  const upload = await request.post("/api/upload", {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: { files: { name: "added-later.stl", mimeType: "model/stl", buffer: Buffer.from(stlBox("later")) } },
  });
  const id = ((await upload.json()) as { prints: { id: string }[] }).prints[0].id;
  await apiJson(request, "post", `/api/print/${id}/meta`, adminToken, { title: later });
  await apiJson(request, "post", `/api/collection/${collection.id}/items/${id}`, adminToken);

  await member.reload();
  await expect(member.getByText(later)).toBeVisible();

  await apiJson(request, "put", `/api/collection/${collection.id}/shares`, adminToken, { user_ids: [] });
  await member.reload();
  await expect(member.getByText(later)).toHaveCount(0);
  await memberCtx.close();
});

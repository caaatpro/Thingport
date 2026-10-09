import { createRouter } from "../../http/route";
import { sendPrintsZip } from "../../services/downloadZip";
import {
  createCategory,
  deleteCategory,
  listCategories,
  loadCategoryDownload,
  moveCategory,
  reorderCategories,
  updateCategory,
  updateCategoryMeta,
} from "./categories";
import { toCategoryOut } from "./dto";
import { categoryBody, categoryMetaBody, moveCategoryBody, reorderCategoriesBody } from "./schemas";

export const categoriesApi = createRouter();

categoriesApi.get("/categories", async ({ userId }) => (await listCategories(userId)).map(toCategoryOut));

categoriesApi.post("/categories/reorder", { body: reorderCategoriesBody }, async ({ userId, body }) => {
  await reorderCategories(userId, body.category_ids);
  return { ok: true };
});

categoriesApi.post("/category/:id/move", { body: moveCategoryBody }, async ({ userId, params, body }) =>
  toCategoryOut(await moveCategory(userId, params.id, body)),
);

categoriesApi.post("/categories", { body: categoryBody }, async ({ userId, body }) =>
  toCategoryOut(await createCategory(userId, body)),
);

categoriesApi.patch("/category/:id", { body: categoryBody }, async ({ userId, params, body }) =>
  toCategoryOut(await updateCategory(userId, params.id, body)),
);

categoriesApi.patch("/category/:id/meta", { body: categoryMetaBody }, async ({ userId, params, body }) =>
  toCategoryOut(await updateCategoryMeta(userId, params.id, body)),
);

categoriesApi.delete("/category/:id", async ({ userId, params }) => {
  await deleteCategory(userId, params.id);
  return { ok: true };
});

categoriesApi.get("/category/:id/download", async ({ userId, params, res }) => {
  const { prints, downloadName } = await loadCategoryDownload(userId, params.id);
  await sendPrintsZip(res, prints, downloadName);
});

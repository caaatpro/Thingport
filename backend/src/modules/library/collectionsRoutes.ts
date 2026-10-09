import { createRouter } from "../../http/route";
import { parse } from "../../http/validate";
import {
  addPrintToCollection,
  bookmarkCollection,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  listCollectionShares,
  listCollectionsForPrint,
  removePrintFromCollection,
  setCollectionShares,
  unbookmarkCollection,
  updateCollection,
} from "./collections";
import { collectionBody, setSharesBody } from "./schemas";

export const collectionsApi = createRouter();

collectionsApi.get("/collections", ({ userId }) => listCollections(userId));

collectionsApi.post("/collections", { body: collectionBody }, ({ userId, body }) => createCollection(userId, body));

collectionsApi.get("/collection/:id", ({ userId, params }) => getCollection(userId, params.id));

// The body is validated inside the service call: for a built-in collection the "can't be edited"
// answer has always come before any complaint about the body.
collectionsApi.patch("/collection/:id", ({ userId, params, req }) =>
  updateCollection(userId, params.id, () => parse(collectionBody, req.body)),
);

collectionsApi.delete("/collection/:id", async ({ userId, params }) => {
  await deleteCollection(userId, params.id);
  return { ok: true };
});

collectionsApi.delete("/collection/:id/items/:printId", async ({ userId, params }) => {
  await removePrintFromCollection(userId, params.id, params.printId);
  return { ok: true };
});

collectionsApi.post("/collection/:id/items/:printId", async ({ userId, params }) => {
  await addPrintToCollection(userId, params.id, params.printId);
  return { ok: true };
});

collectionsApi.post("/collection/:id/bookmark", async ({ userId, params }) => {
  await bookmarkCollection(userId, params.id);
  return { ok: true };
});

collectionsApi.delete("/collection/:id/bookmark", async ({ userId, params }) => {
  await unbookmarkCollection(userId, params.id);
  return { ok: true };
});

collectionsApi.get("/print/:id/collections", ({ userId, params }) => listCollectionsForPrint(userId, params.id));

collectionsApi.get("/collection/:id/shares", ({ userId, params }) => listCollectionShares(userId, params.id));

// Validated inside the service call for the same reason as PATCH above: ownership is checked first.
collectionsApi.put("/collection/:id/shares", async ({ userId, params, req }) => {
  await setCollectionShares(userId, params.id, () => parse(setSharesBody, req.body));
  return { ok: true };
});

import { createRouter } from "../../http/route";
import { addTagBookmark, listBookmarks, removeTagBookmark, reorderBookmarks } from "./bookmarks";
import { reorderBookmarksBody, tagSummaryQuery } from "./schemas";
import { bookmarkedTagNames, tagSummary } from "./tags";

export const tagsApi = createRouter();

tagsApi.get("/tags/summary", { query: tagSummaryQuery }, ({ userId, query }) => tagSummary(userId, query.sort));

tagsApi.get("/tags/bookmarked", ({ userId }) => bookmarkedTagNames(userId));

tagsApi.post("/tags/:tag/bookmark", async ({ userId, params }) => {
  await addTagBookmark(userId, params.tag);
  return { ok: true };
});

tagsApi.delete("/tags/:tag/bookmark", async ({ userId, params }) => {
  await removeTagBookmark(userId, params.tag);
  return { ok: true };
});

tagsApi.get("/bookmarks", ({ userId }) => listBookmarks(userId));

tagsApi.post("/bookmarks/reorder", { body: reorderBookmarksBody }, async ({ userId, body }) => {
  await reorderBookmarks(userId, body.bookmark_ids);
  return listBookmarks(userId);
});

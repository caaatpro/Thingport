import { Router } from "express";
import { requireAuth } from "../auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getDashboardSummary,
  getTopAuthorsList,
  getTopPrintedList,
  getTopViewedList,
  type DashboardAuthor,
  type DashboardModel,
  type DashboardProvider,
} from "../services/dashboardService";

const router = Router();
router.use(requireAuth);

function modelOut(m: DashboardModel) {
  return {
    id: m.id,
    name: m.name,
    thumb_url: m.thumbUrl,
    view_count: m.viewCount,
    print_count: m.printCount,
    created_at: m.createdAt,
  };
}

function authorOut(a: DashboardAuthor) {
  return {
    id: a.id,
    name: a.name,
    handle: a.handle,
    avatar_url: a.avatarUrl,
    model_count: a.modelCount,
  };
}

function providerOut(p: DashboardProvider) {
  return { provider: p.provider, model_count: p.modelCount };
}

// The routes below back each card's "see more" dialog.
router.get(
  "/dashboard/summary",
  asyncHandler(async (req, res) => {
    const summary = await getDashboardSummary(req.userId!);
    res.json({
      collection_count: summary.collectionCount,
      model_count: summary.modelCount,
      author_count: summary.authorCount,
      category_count: summary.categoryCount,
      top_viewed: summary.topViewed.map(modelOut),
      top_printed: summary.topPrinted.map(modelOut),
      top_authors: summary.topAuthors.map(authorOut),
      top_providers: summary.topProviders.map(providerOut),
      recently_added: summary.recentlyAdded.map(modelOut),
      recently_viewed: summary.recentlyViewed.map(modelOut),
      favorites: summary.favorites.map(modelOut),
    });
  }),
);

router.get(
  "/dashboard/top-viewed",
  asyncHandler(async (req, res) => {
    res.json((await getTopViewedList(req.userId!)).map(modelOut));
  }),
);

router.get(
  "/dashboard/top-printed",
  asyncHandler(async (req, res) => {
    res.json((await getTopPrintedList(req.userId!)).map(modelOut));
  }),
);

router.get(
  "/dashboard/top-authors",
  asyncHandler(async (req, res) => {
    res.json((await getTopAuthorsList(req.userId!)).map(authorOut));
  }),
);

export default router;

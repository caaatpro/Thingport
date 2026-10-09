import type { Router } from "express";
import authorsRouter from "../../routes/authors";
import categoriesRouter from "../../routes/categories";
import tagsRouter from "../../routes/tags";
import collectionsRouter from "../../routes/collections";
import bookmarksRouter from "../../routes/bookmarks";
import searchRouter from "../../routes/search";
import dashboardRouter from "../../routes/dashboard";

// Transitional: these still live in src/routes and are moved into this module one by one.
export const routers: Router[] = [
  authorsRouter,
  categoriesRouter,
  tagsRouter,
  collectionsRouter,
  bookmarksRouter,
  searchRouter,
  dashboardRouter,
];

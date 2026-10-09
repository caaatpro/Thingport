import type { Router } from "express";
import { authorsApi } from "./authorsRoutes";
import { categoriesApi } from "./categoriesRoutes";
import { collectionsApi } from "./collectionsRoutes";
import { discoveryApi } from "./discoveryRoutes";
import { tagsApi } from "./tagsRoutes";

export const routers: Router[] = [
  authorsApi.router,
  categoriesApi.router,
  tagsApi.router,
  collectionsApi.router,
  discoveryApi.router,
];

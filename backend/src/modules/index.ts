import type { Router } from "express";
import { routers as accounts } from "./accounts/routes";
import { routers as admin } from "./admin/routes";
import { routers as imports } from "./imports/routes";
import { routers as library } from "./library/routes";
import { routers as prints } from "./prints/routes";
import { publicRouters as systemPublic, routers as system } from "./system/routes";

/**
 * Every API router, in mounting order. Each feature module owns its routes under `src/modules/<name>/`
 * and exports them from `routes.ts`. Mounted under `/api` by `createApp()`.
 *
 * Order matters only while a legacy router still calls `router.use(requireAuth)` for all paths: public
 * routes (health, sign-in) must come first and admin last. Routes built with `createRouter()` state their
 * access per route and don't care.
 */
export const apiRouters: Router[] = [
  ...systemPublic,
  ...accounts,
  ...system,
  ...prints,
  ...library,
  ...imports,
  ...admin,
];

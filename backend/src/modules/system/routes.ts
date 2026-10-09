import type { Router } from "express";
import healthRouter from "../../routes/health";
import notificationsRouter from "../../routes/notifications";
import settingsRouter from "../../routes/settings";

// Transitional: these still live in src/routes and are moved into this module one by one.
/** Public; must be mounted before any router that applies `requireAuth` to everything. */
export const publicRouters: Router[] = [healthRouter];
export const routers: Router[] = [settingsRouter, notificationsRouter];

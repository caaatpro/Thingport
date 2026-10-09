import type { Router } from "express";
import adminRouter from "../../routes/admin";

// Transitional: these still live in src/routes and are moved into this module one by one.
export const routers: Router[] = [adminRouter];

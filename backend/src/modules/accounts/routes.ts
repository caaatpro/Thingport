import type { Router } from "express";
import authRouter from "../../routes/auth";
import usersRouter from "../../routes/users";
import tokensRouter from "../../routes/tokens";

// Transitional: these still live in src/routes and are moved into this module one by one.
export const routers: Router[] = [authRouter, usersRouter, tokensRouter];

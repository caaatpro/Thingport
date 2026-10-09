import express, { type Express } from "express";
import cors from "cors";
import { resolveCorsOrigins } from "./cors";

import { errorHandler, notFoundHandler } from "./http/errorHandler";
import { requestLogger } from "./http/requestLogger";
import { apiRouters } from "./modules";

export function createApp(): Express {
  const app = express();

  // Behind the frontend nginx (and usually another proxy): trust its forwarded client address.
  app.set("trust proxy", process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1);

  const origins = resolveCorsOrigins();
  app.use(
    cors({
      origin: origins.includes("*") ? true : origins,
      credentials: true,
      exposedHeaders: ["X-Has-More", "X-Next-Offset", "X-Total-Count"],
    }),
  );

  app.use(express.json());
  // Express 5 leaves req.body undefined when a request carries no body; handlers (and schemas whose
  // fields all have defaults) expect the empty object Express 4 gave them.
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });

  app.use(requestLogger);

  // The frontend's nginx proxies /api/* here unmodified.
  for (const router of apiRouters) app.use("/api", router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

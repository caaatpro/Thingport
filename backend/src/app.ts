import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { MulterError } from "multer";
import { resolveCorsOrigins } from "./cors";
import { HttpError } from "./utils/fileUtils";

import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import tokensRoutes from "./routes/tokens";
import printsRoutes from "./routes/prints";
import authorsRoutes from "./routes/authors";
import platesRoutes from "./routes/plates";
import previewImagesRoutes from "./routes/previewImages";
import categoriesRoutes from "./routes/categories";
import printFilesRoutes from "./routes/printFiles";
import tagsRoutes from "./routes/tags";
import settingsRoutes from "./routes/settings";
import importsRoutes from "./routes/imports";
import collectionsRoutes from "./routes/collections";
import bookmarksRoutes from "./routes/bookmarks";
import searchRoutes from "./routes/search";
import notificationsRoutes from "./routes/notifications";
import adminRoutes from "./routes/admin";
import dashboardRoutes from "./routes/dashboard";

export function createApp(): Express {
  const app = express();

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

  // The frontend's nginx proxies /api/* here unmodified.
  app.use("/api", healthRoutes);
  app.use("/api", authRoutes);
  app.use("/api", usersRoutes);
  app.use("/api", tokensRoutes);
  app.use("/api", settingsRoutes);
  app.use("/api", printsRoutes);
  app.use("/api", authorsRoutes);
  app.use("/api", platesRoutes);
  app.use("/api", previewImagesRoutes);
  app.use("/api", categoriesRoutes);
  app.use("/api", printFilesRoutes);
  app.use("/api", tagsRoutes);
  app.use("/api", importsRoutes);
  app.use("/api", collectionsRoutes);
  app.use("/api", bookmarksRoutes);
  app.use("/api", searchRoutes);
  app.use("/api", notificationsRoutes);
  app.use("/api", adminRoutes);
  app.use("/api", dashboardRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ detail: "Not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ detail: err.message, ...(err.code ? { code: err.code } : {}) });
      return;
    }
    // multer rejects (e.g. a file over the size limit) are the client's fault, not a 500. Turn them
    // into a clear 4xx so the UI can show "File too large" instead of a generic server error.
    if (err instanceof MulterError) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({
        detail: tooLarge ? "File is too large." : `Upload rejected: ${err.message}`,
        code: err.code,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ detail: "Internal server error" });
  });

  return app;
}

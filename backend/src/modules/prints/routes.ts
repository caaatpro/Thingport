import type { Router } from "express";
import printsRouter from "../../routes/prints";
import platesRouter from "../../routes/plates";
import previewImagesRouter from "../../routes/previewImages";
import printFilesRouter from "../../routes/printFiles";

// Transitional: these still live in src/routes and are moved into this module one by one.
export const routers: Router[] = [printsRouter, platesRouter, previewImagesRouter, printFilesRouter];

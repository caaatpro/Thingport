import { prisma } from "../../db";
import { badRequest, notFound } from "../../http/errors";
import { createRouter } from "../../http/route";
import { thumbnailUpload } from "../../http/upload";
import { printReadWhere } from "./access";
import { IMMUTABLE_PRIVATE_CACHE, sendStoredFile } from "./fileResponse";
import { requireWritablePrint } from "./lookup";
import {
  addPreviewImages,
  deletePreviewImage,
  previewImageExists,
  previewImagePath,
  reorderPreviewImages,
} from "./previewImages";
import { printOutById } from "./printLoader";
import { reorderImagesBody } from "./schemas";

export const previewImageRouter = createRouter();

previewImageRouter.get("/preview-image/:id/file.jpg", async ({ res, params, userId }) => {
  const image = await prisma.previewImage.findFirst({ where: { id: params.id, print: printReadWhere(userId) } });
  if (!image || !previewImageExists(image.id)) throw notFound();
  sendStoredFile(res, previewImagePath(image.id), { contentType: "image/jpeg", cacheControl: IMMUTABLE_PRIVATE_CACHE });
});

previewImageRouter.post(
  "/print/:id/preview-images",
  { use: [thumbnailUpload.array("files")] },
  async ({ req, params, userId }) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest("No files uploaded");
    const print = await requireWritablePrint(userId, params.id, "EDIT");
    await addPreviewImages(
      print.id,
      files.map((f) => f.buffer),
    );
    return { print: await printOutById(userId, print.id) };
  },
);

previewImageRouter.delete("/print/:id/preview-images/:imageId", async ({ params, userId }) => {
  const print = await requireWritablePrint(userId, params.id, "EDIT");
  await deletePreviewImage(print.id, params.imageId);
  return { print: await printOutById(userId, print.id) };
});

previewImageRouter.post(
  "/print/:id/preview-images/reorder",
  { body: reorderImagesBody },
  async ({ params, body, userId }) => {
    const print = await requireWritablePrint(userId, params.id, "EDIT");
    await reorderPreviewImages(print.id, body.image_ids);
    return { print: await printOutById(userId, print.id) };
  },
);

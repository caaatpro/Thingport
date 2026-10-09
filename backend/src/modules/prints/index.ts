// The prints module's public surface: the only file other modules may import from.
export { collectionReadWhere, requireCollectionRole } from "./access";
export { toPrintOut, type PrintOut, type PrintAccessCtx } from "./dto";
export { sendPrintsZip } from "./zipResponse";
export { listZipEntries, extractZipEntriesToPrints } from "./zipExtract";
export { loadFullPrint, printOutById, printOutsByIds } from "./printLoader";
export { addPreviewImage, deleteAllPreviewImages } from "./previewImages";
export { deleteAllPrintFiles } from "./printFiles";
export {
  addPlatesToPrint,
  createPrint,
  deletePlateFiles,
  resolvePlateFilePath,
  type NewPlateInput,
  type PrintMetaInput,
} from "./printCreation";
export { availableModelName } from "./naming";
export {
  plateThumbExists,
  plateThumbPath,
  ensurePlateThumbnail,
  extractFusionThumbnail,
  renderPlateThumbnail,
  saveThumbFromBytes,
  saveThumbFromFile,
} from "./plateThumbnails";
export {
  DEFAULT_STORAGE_TEMPLATE,
  STORAGE_TEMPLATE_TOKENS,
  getStorageTemplate,
  setStorageTemplate,
  validateStorageTemplate,
  samplePlateStoragePaths,
  reorganizeManagedPrints,
  relocatePrintsForToken,
} from "./storage";

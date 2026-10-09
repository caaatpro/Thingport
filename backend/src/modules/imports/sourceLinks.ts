import { CULTS3D_MODEL_URL_PREFIX, parseCults3dModelUrl } from "./providers/cults3d";
import { parseMakerworldModelUrl } from "./providers/makerworld/urls";
import { parsePrintablesModelUrl } from "./providers/printables";
import { parseThingiverseThingUrl } from "./providers/thingiverse";

export type SourceModel = { provider: string; externalId: string };

/** Provider + stable external id for a model URL, used to dedupe imports. Null if unknown. */
export function identifySourceModel(url: string): SourceModel | null {
  const makerworld = parseMakerworldModelUrl(url);
  if (makerworld) return { provider: "makerworld", externalId: makerworld.designId };
  const thingiverse = parseThingiverseThingUrl(url);
  if (thingiverse) return { provider: "thingiverse", externalId: thingiverse.thingId };
  const printables = parsePrintablesModelUrl(url);
  if (printables) return { provider: "printables", externalId: printables.modelId };
  const cults = parseCults3dModelUrl(url);
  if (cults) return { provider: "cults3d", externalId: `${cults.category}/${cults.slug}` };
  return null;
}

/** Inverse of identifySourceModel, for the "Open in {Provider}" link. */
export function buildImportSourceUrl(provider: string | null, externalId: string | null): string | null {
  if (!provider || !externalId) return null;
  if (provider === "makerworld") return `https://makerworld.com/en/models/${externalId}`;
  if (provider === "thingiverse") return `https://www.thingiverse.com/thing:${externalId}`;
  if (provider === "printables") return `https://www.printables.com/model/${externalId}`;
  if (provider === "cults3d") return `${CULTS3D_MODEL_URL_PREFIX}${externalId}`;
  return null;
}

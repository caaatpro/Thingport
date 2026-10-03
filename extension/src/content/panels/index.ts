import { ctx } from "../context";
import { renderPanel } from "../shell";
import { successHtml } from "./results";
import { loadBatchEntries } from "./batch";
import { loadMakerworldGuidedCollection } from "./makerworldCollection";
import { loadSingleItem } from "./single";

export async function loadPanel(): Promise<void> {
  const { alreadyImported, instanceUrl } = ctx();
  if (alreadyImported) {
    const link = alreadyImported.printId ? `${instanceUrl}/models/${alreadyImported.printId}` : `${instanceUrl}/models`;
    renderPanel(successHtml(link, "You've already imported this model.", "Already in Thingport"));
    return;
  }
  const { kind, provider } = ctx().classification;
  if (kind === "single") await loadSingleItem();
  else if (provider === "makerworld") await loadMakerworldGuidedCollection();
  else await loadBatchEntries();
}

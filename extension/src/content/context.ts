import type { Classification } from "../shared/urls";

/** The model is in the library but this MakerWorld profile may not be, so offer to add it. */
export type LibraryState = { state: "profile_missing" | "profile_unknown"; printId: string | null };

/** Set once per page by init(); title is filled in later. */
export type ImportContext = {
  url: string;
  instanceUrl: string;
  classification: Classification;
  library: LibraryState | null;
  /** The whole model is already in the library, so the panel just says so and links to it. */
  alreadyImported?: { printId: string | null };
  title?: string | null;
};

let current: ImportContext | null = null;

export function setContext(context: ImportContext | null): void {
  current = context;
}

/** Throws once an SPA navigation has cleared it; flows that must survive capture what they need
 *  up front. */
export function ctx(): ImportContext {
  if (!current) throw new Error("The page changed while this was running");
  return current;
}

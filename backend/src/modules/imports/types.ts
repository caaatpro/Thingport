import type { Author, Plate, PreviewImage, Print } from "../../generated/prisma/client";

export type ImportCookies = {
  makerworld_cookie?: string | null;
};

export type ImportRequestBody = ImportCookies & {
  url: string;
  title?: string | null;
  notes?: string | null;
  tags?: string[];
  category_id?: string | null;
  filename?: string | null;
  /** Download URL the Thingport Grab extension already resolved in the page; skips server-side
   *  resolution. */
  resolved_download_url?: string | null;
  /** The MakerWorld profile resolved_download_url downloads, when known. */
  resolved_instance_id?: string | null;
  /** The page's MakerWorld design data, so the backend needn't fetch a Cloudflare-gated page.
   *  Client-supplied -- see makerworldMetaFromExtension. */
  makerworld_design?: Record<string, unknown> | null;
  /** Cults3D page metadata read by the extension. Client-supplied -- see cults3dMetaFromExtension. */
  page_meta?: Record<string, unknown> | null;
  /** Cults3D: one resolved link per file of the order. Client-supplied; each is SSRF-checked on fetch. */
  resolved_files?: { url: string; filename?: string | null }[] | null;
  /** Internal only: per-request delay for MakerWorld collection imports. Never from the body. */
  makerworldPaceMs?: number;
};

export type MakerworldProfileRef = { instanceId: string | null };

export type ImportedAuthorInfo = {
  provider: string;
  externalId: string;
  name: string | null;
  handle: string | null;
  bio: string | null;
  bioTranslated: string | null;
  links: string[];
  avatarUrl: string | null;
  backgroundUrl: string | null;
  /** Came from the client: may create the author's record but never overwrites one. */
  unverified?: boolean;
};

export type ImportedPageMetadata = {
  title: string | null;
  tags: string[];
  description: string | null;
  creator: string | null;
  previewImageUrl: string | null;
  /** A known-clean filename, when the resolver has one. */
  filename: string | null;
  /** Photo gallery, attached as supporting files; previewImageUrl is the cover. */
  galleryImages: { url: string; filename: string }[];
  /** Structured creator record; `creator` stays a plain display string. */
  author: ImportedAuthorInfo | null;
  /** The site's own category ids; each site has its own id namespace. */
  siteCategoryIds: number[];
  categorySite: "makerworld" | "thingiverse" | "printables" | null;
  /** Lets a second profile of an imported design be added as its own plate. MakerWorld only. */
  makerworldProfile?: MakerworldProfileRef;
};

/** What importing a link produced (or, for a duplicate, what was already there). */
export type ImportedPrint = {
  print: Print;
  plates: Plate[];
  author: Author | null;
  previewImages: PreviewImage[];
  alreadyImported: boolean;
  /** Set when an existing MakerWorld print gained another profile's file. */
  profileAdded?: boolean;
};

export type OpenImportResult = {
  response: Response;
  finalUrl: string;
  meta: ImportedPageMetadata;
};

export type SavedImport = {
  tempPath: string;
  filename: string;
  mime: string;
  meta: ImportedPageMetadata;
};

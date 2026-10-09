import type { ImportCollectionEntriesResult } from "@/api/imports";
import type { ZipEntry } from "@/utils/zipUtils";

export type ImportMode = "separate" | "multiplate";

export type ModePromptConfig = {
  label: string;
  count: number;
  onChoose: (mode: ImportMode) => Promise<void>;
};

export type ZipPromptConfig = {
  label: string;
  onImportAsZip: () => Promise<void>;
  loadEntries: () => Promise<ZipEntry[]>;
  onImportSelected: (entries: string[]) => Promise<void>;
};

export type CollectionPromptConfig = {
  label: string;
  loadEntries: () => Promise<ImportCollectionEntriesResult>;
  onImportSelected: (ids: string[]) => Promise<void>;
};

export type Prompt =
  | { kind: "mode"; config: ModePromptConfig }
  | { kind: "zip"; config: ZipPromptConfig }
  | { kind: "collection"; config: CollectionPromptConfig };

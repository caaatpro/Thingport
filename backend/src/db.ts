import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { STORAGE, THUMBS, BUNDLES, PREVIEWS, MODEL_PREVIEWS, NORMALIZED_3MFS } from "./config";

for (const dir of [STORAGE, THUMBS, BUNDLES, PREVIEWS, MODEL_PREVIEWS, NORMALIZED_3MFS]) {
  fs.mkdirSync(dir, { recursive: true });
}
// The cache's name before it became NORMALIZED_3MFS; nothing reads it any more.
fs.rmSync(path.join(STORAGE, "sanitized-3mf"), { recursive: true, force: true });

/** A client for `connectionString`, which is also how the admin database switch builds its candidate. */
export function createPrismaClient(connectionString: string): PrismaClient {
  // The pg driver has no connection timeout by default; Prisma's own engine used 10 s.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 10_000 }) });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
let client = createPrismaClient(databaseUrl);

// Forwards to whichever client is current, so databaseSettingsService.ts can swap it without
// every importer holding a stale reference.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    return Reflect.get(client as object, prop, client);
  },
});

/** Only called after the new connection has been verified. */
export function setActiveClient(next: PrismaClient): void {
  const old = client;
  client = next;
  void old.$disconnect().catch(() => undefined);
}

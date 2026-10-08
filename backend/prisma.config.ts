import "dotenv/config";
import { defineConfig } from "prisma/config";

// The connection URL is only needed by commands that touch the database (migrate deploy); `prisma
// generate` runs at image build time without one, so a missing variable must not fail the config load.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});

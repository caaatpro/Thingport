-- CreateEnum
CREATE TYPE "CollectionRole" AS ENUM ('VIEW', 'UPLOAD', 'EDIT', 'DELETE');

-- AlterTable: existing shares stay read-only
ALTER TABLE "CollectionShare" ADD COLUMN "role" "CollectionRole" NOT NULL DEFAULT 'VIEW';

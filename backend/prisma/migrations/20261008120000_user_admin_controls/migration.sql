-- Admin user management: disable accounts, show last sign-in, sign a user out everywhere.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

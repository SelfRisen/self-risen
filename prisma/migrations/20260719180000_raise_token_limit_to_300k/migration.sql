-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tokenLimitPerMonth" SET DEFAULT 300000;

-- Bump existing users still on the old default
UPDATE "User" SET "tokenLimitPerMonth" = 300000 WHERE "tokenLimitPerMonth" = 30000;

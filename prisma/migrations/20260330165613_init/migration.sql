-- DropIndex
DROP INDEX "public"."VisionBoard_categoryId_idx";

-- DropIndex
DROP INDEX "public"."VisionBoard_userId_idx";

-- AlterTable
ALTER TABLE "VisionBoard" ADD COLUMN     "name" TEXT;

-- CreateIndex
CREATE INDEX "VisionBoard_userId_isGloabal_idx" ON "VisionBoard"("userId", "isGloabal");

-- CreateIndex
CREATE INDEX "VisionBoard_userId_name_idx" ON "VisionBoard"("userId", "name");

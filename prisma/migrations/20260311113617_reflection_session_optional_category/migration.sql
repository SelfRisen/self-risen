-- DropForeignKey
ALTER TABLE "public"."ReflectionSession" DROP CONSTRAINT "ReflectionSession_categoryId_fkey";

-- AlterTable
ALTER TABLE "ReflectionSession" ALTER COLUMN "categoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ReflectionSession" ADD CONSTRAINT "ReflectionSession_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WheelCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

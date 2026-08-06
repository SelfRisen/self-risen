-- AlterTable
ALTER TABLE "AffirmationLoop" ADD COLUMN     "affirmationOffsets" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];

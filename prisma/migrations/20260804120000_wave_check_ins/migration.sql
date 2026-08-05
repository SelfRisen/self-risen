-- AlterTable
ALTER TABLE "Wave" ADD COLUMN     "cadence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "endedEarlyAt" TIMESTAMP(3),
ADD COLUMN     "reminderTimes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "WaveCheckIn" (
    "id" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaveCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaveCheckIn_waveId_date_idx" ON "WaveCheckIn"("waveId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WaveCheckIn_waveId_date_key" ON "WaveCheckIn"("waveId", "date");

-- AddForeignKey
ALTER TABLE "WaveCheckIn" ADD CONSTRAINT "WaveCheckIn_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

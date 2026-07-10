-- AlterTable: drop the old global (non-loop-scoped) reminder fields
ALTER TABLE "User" DROP COLUMN IF EXISTS "loopReminderEnabled",
DROP COLUMN IF EXISTS "loopReminderTimes";

-- CreateTable
CREATE TABLE "LoopReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loopId" TEXT NOT NULL,
    "morningTime" TEXT,
    "eveningTime" TEXT,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoopReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoopReminder_loopId_key" ON "LoopReminder"("loopId");

-- CreateIndex
CREATE INDEX "LoopReminder_userId_idx" ON "LoopReminder"("userId");

-- CreateIndex
CREATE INDEX "LoopReminder_isActive_idx" ON "LoopReminder"("isActive");

-- AddForeignKey
ALTER TABLE "LoopReminder" ADD CONSTRAINT "LoopReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoopReminder" ADD CONSTRAINT "LoopReminder_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "AffirmationLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

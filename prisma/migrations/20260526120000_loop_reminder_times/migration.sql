-- AlterTable: replace morning/evening columns with times array
ALTER TABLE "User" ADD COLUMN "loopReminderTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "User"
SET "loopReminderTimes" = ARRAY_REMOVE(
  ARRAY["loopReminderMorning", "loopReminderEvening"],
  NULL
)
WHERE "loopReminderMorning" IS NOT NULL OR "loopReminderEvening" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "loopReminderMorning",
DROP COLUMN "loopReminderEvening";

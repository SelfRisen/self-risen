-- Tracks when a user's monthly loop-token allowance was last reset
ALTER TABLE "User" ADD COLUMN "loopTokensResetAt" TIMESTAMP(3);

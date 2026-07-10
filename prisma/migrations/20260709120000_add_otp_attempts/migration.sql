-- Tracks failed verification attempts so verifyPasswordResetOtp can lock out after too many tries
ALTER TABLE "PasswordResetOtp" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

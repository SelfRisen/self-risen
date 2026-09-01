-- The user's own recording of a single affirmation. Recordings used to be kept
-- on the session, so only one could exist per belief no matter how many
-- affirmations were carried forward from it.
ALTER TABLE "Affirmation" ADD COLUMN "userAudioUrl" TEXT;

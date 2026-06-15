-- Location is determined by countryCode only; timezone derived server-side
ALTER TABLE "User" DROP COLUMN IF EXISTS "city";

-- Drop locale column; location is determined by countryCode + city (timezone derived server-side)
ALTER TABLE "User" DROP COLUMN IF EXISTS "locale";

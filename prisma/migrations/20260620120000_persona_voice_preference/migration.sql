-- Rename TtsVoicePreference from gender-based values to persona names
CREATE TYPE "TtsVoicePreference_new" AS ENUM ('SAGE', 'PHOENIX', 'RIVER', 'QUINN', 'ALEX', 'ROBIN');

ALTER TABLE "User" ALTER COLUMN "ttsVoicePreference" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "ttsVoicePreference" TYPE "TtsVoicePreference_new" USING (
  CASE "ttsVoicePreference"::text
    WHEN 'FEMALE_EMPATHETIC' THEN 'SAGE'
    WHEN 'FEMALE_ENERGETIC' THEN 'PHOENIX'
    WHEN 'MALE_CONFIDENT' THEN 'RIVER'
    WHEN 'MALE_FRIENDLY' THEN 'QUINN'
    WHEN 'ANDROGYNOUS_CALM' THEN 'ALEX'
    WHEN 'ANDROGYNOUS_WISE' THEN 'ROBIN'
    ELSE NULL
  END::"TtsVoicePreference_new"
);

ALTER TABLE "Affirmation" ALTER COLUMN "ttsVoicePreference" TYPE "TtsVoicePreference_new" USING (
  CASE "ttsVoicePreference"::text
    WHEN 'FEMALE_EMPATHETIC' THEN 'SAGE'
    WHEN 'FEMALE_ENERGETIC' THEN 'PHOENIX'
    WHEN 'MALE_CONFIDENT' THEN 'RIVER'
    WHEN 'MALE_FRIENDLY' THEN 'QUINN'
    WHEN 'ANDROGYNOUS_CALM' THEN 'ALEX'
    WHEN 'ANDROGYNOUS_WISE' THEN 'ROBIN'
    ELSE NULL
  END::"TtsVoicePreference_new"
);

ALTER TABLE "AffirmationLoop" ALTER COLUMN "voicePreference" TYPE "TtsVoicePreference_new" USING (
  CASE "voicePreference"::text
    WHEN 'FEMALE_EMPATHETIC' THEN 'SAGE'
    WHEN 'FEMALE_ENERGETIC' THEN 'PHOENIX'
    WHEN 'MALE_CONFIDENT' THEN 'RIVER'
    WHEN 'MALE_FRIENDLY' THEN 'QUINN'
    WHEN 'ANDROGYNOUS_CALM' THEN 'ALEX'
    WHEN 'ANDROGYNOUS_WISE' THEN 'ROBIN'
    ELSE NULL
  END::"TtsVoicePreference_new"
);

ALTER TABLE "User" ALTER COLUMN "ttsVoicePreference" SET DEFAULT 'ALEX'::"TtsVoicePreference_new";

DROP TYPE "TtsVoicePreference";
ALTER TYPE "TtsVoicePreference_new" RENAME TO "TtsVoicePreference";

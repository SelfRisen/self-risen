-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReflectionSessionStatus" AS ENUM ('PENDING', 'BELIEF_CAPTURED', 'AFFIRMATION_GENERATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AffirmationLoopStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "TtsVoicePreference" AS ENUM ('SAGE', 'PHOENIX', 'RIVER', 'QUINN', 'ALEX', 'ROBIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "avatar" TEXT,
    "pushTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "streak" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "lastStreakDate" TIMESTAMP(3),
    "lastLoggedInAt" TIMESTAMP(3),
    "lastLoggedOutAt" TIMESTAMP(3),
    "ttsVoicePreference" "TtsVoicePreference" DEFAULT 'ALEX',
    "tokensUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "tokenLimitPerMonth" INTEGER NOT NULL DEFAULT 30000,
    "tokenResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streakReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "streakReminderTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "countryCode" TEXT,
    "region" TEXT,
    "locationUpdatedAt" TIMESTAMP(3),
    "loopTokensRemaining" INTEGER NOT NULL DEFAULT 5,
    "loopTokensResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "streak" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channels" "NotificationChannelType"[],
    "generatedByUserId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "estateId" TEXT,
    "iconUrl" TEXT,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "deepLink" TEXT,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAuditLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "NotificationChannelType" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeadLetterQueue" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "NotificationChannelType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "lastError" TEXT NOT NULL,
    "jobData" JSONB NOT NULL DEFAULT '{}',
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelOfLife" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WheelOfLife_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelCategory" (
    "id" TEXT NOT NULL,
    "wheelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WheelCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelAssessment" (
    "id" TEXT NOT NULL,
    "wheelId" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "strongestArea" TEXT,
    "weakestArea" TEXT,
    "imbalanceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WheelAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelFocus" (
    "id" TEXT NOT NULL,
    "wheelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "wheelAssessmentId" TEXT,

    CONSTRAINT "WheelFocus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReflectionSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "wheelFocusId" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "rawBeliefText" TEXT,
    "audioUrl" TEXT,
    "transcriptionText" TEXT,
    "limitingBelief" TEXT,
    "selectedAffirmationText" TEXT,
    "selectedAffirmationAudioUrl" TEXT,
    "userAffirmationAudioUrl" TEXT,
    "playbackCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "beliefRerecordedAt" TIMESTAMP(3),
    "beliefRerecordCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ReflectionSessionStatus" NOT NULL DEFAULT 'PENDING',
    "isVision" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReflectionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wave" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affirmation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "affirmationText" TEXT NOT NULL,
    "audioUrl" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "ttsVoicePreference" "TtsVoicePreference",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffirmationLoop" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AffirmationLoopStatus" NOT NULL DEFAULT 'PROCESSING',
    "audioPath" TEXT,
    "durationSeconds" INTEGER,
    "backgroundMusicKey" TEXT NOT NULL,
    "voicePreference" "TtsVoicePreference",
    "errorMessage" TEXT,
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffirmationLoop_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "AffirmationLoopItem" (
    "loopId" TEXT NOT NULL,
    "affirmationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "AffirmationLoopItem_pkey" PRIMARY KEY ("loopId","affirmationId")
);

-- CreateTable
CREATE TABLE "VisionBoard" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "isGloabal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vision" (
    "id" TEXT NOT NULL,
    "visionBoardId" TEXT NOT NULL,
    "reflectionSessionId" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER,
    "backgroundSoundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReflectionSound" (
    "id" TEXT NOT NULL,
    "reflectionSessionId" TEXT NOT NULL,
    "soundUrl" TEXT NOT NULL,
    "name" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReflectionSound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionBoardSound" (
    "id" TEXT NOT NULL,
    "soundUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionBoardSound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseId_key" ON "User"("firebaseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "StreakHistory_userId_idx" ON "StreakHistory"("userId");

-- CreateIndex
CREATE INDEX "StreakHistory_userId_date_idx" ON "StreakHistory"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StreakHistory_userId_date_key" ON "StreakHistory"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_requestId_key" ON "Notification"("requestId");

-- CreateIndex
CREATE INDEX "Notification_requestId_idx" ON "Notification"("requestId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_generatedByUserId_idx" ON "Notification"("generatedByUserId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientId_isRead_idx" ON "NotificationRecipient"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientId_createdAt_idx" ON "NotificationRecipient"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_notificationId_idx" ON "NotificationRecipient"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_recipientId_notificationId_key" ON "NotificationRecipient"("recipientId", "notificationId");

-- CreateIndex
CREATE INDEX "NotificationAuditLog_recipientId_notificationType_createdAt_idx" ON "NotificationAuditLog"("recipientId", "notificationType", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationAuditLog_requestId_channel_idx" ON "NotificationAuditLog"("requestId", "channel");

-- CreateIndex
CREATE INDEX "NotificationAuditLog_status_createdAt_idx" ON "NotificationAuditLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationAuditLog_recipientId_createdAt_idx" ON "NotificationAuditLog"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDeadLetterQueue_requestId_idx" ON "NotificationDeadLetterQueue"("requestId");

-- CreateIndex
CREATE INDEX "NotificationDeadLetterQueue_userId_idx" ON "NotificationDeadLetterQueue"("userId");

-- CreateIndex
CREATE INDEX "NotificationDeadLetterQueue_failedAt_idx" ON "NotificationDeadLetterQueue"("failedAt");

-- CreateIndex
CREATE INDEX "NotificationDeadLetterQueue_notificationId_idx" ON "NotificationDeadLetterQueue"("notificationId");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_email_idx" ON "PasswordResetOtp"("email");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_expiresAt_idx" ON "PasswordResetOtp"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WheelOfLife_userId_key" ON "WheelOfLife"("userId");

-- CreateIndex
CREATE INDEX "WheelOfLife_userId_idx" ON "WheelOfLife"("userId");

-- CreateIndex
CREATE INDEX "WheelCategory_wheelId_idx" ON "WheelCategory"("wheelId");

-- CreateIndex
CREATE INDEX "WheelAssessment_wheelId_idx" ON "WheelAssessment"("wheelId");

-- CreateIndex
CREATE INDEX "WheelAssessment_wheelId_createdAt_idx" ON "WheelAssessment"("wheelId", "createdAt");

-- CreateIndex
CREATE INDEX "WheelFocus_wheelId_idx" ON "WheelFocus"("wheelId");

-- CreateIndex
CREATE INDEX "WheelFocus_categoryId_idx" ON "WheelFocus"("categoryId");

-- CreateIndex
CREATE INDEX "WheelFocus_wheelId_isActive_idx" ON "WheelFocus"("wheelId", "isActive");

-- CreateIndex
CREATE INDEX "ReflectionSession_userId_idx" ON "ReflectionSession"("userId");

-- CreateIndex
CREATE INDEX "ReflectionSession_categoryId_idx" ON "ReflectionSession"("categoryId");

-- CreateIndex
CREATE INDEX "ReflectionSession_wheelFocusId_idx" ON "ReflectionSession"("wheelFocusId");

-- CreateIndex
CREATE INDEX "ReflectionSession_userId_status_idx" ON "ReflectionSession"("userId", "status");

-- CreateIndex
CREATE INDEX "ReflectionSession_userId_createdAt_idx" ON "ReflectionSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Wave_sessionId_isActive_idx" ON "Wave"("sessionId", "isActive");

-- CreateIndex
CREATE INDEX "Wave_endDate_isActive_idx" ON "Wave"("endDate", "isActive");

-- CreateIndex
CREATE INDEX "Affirmation_sessionId_idx" ON "Affirmation"("sessionId");

-- CreateIndex
CREATE INDEX "Affirmation_sessionId_isSelected_idx" ON "Affirmation"("sessionId", "isSelected");

-- CreateIndex
CREATE INDEX "Affirmation_sessionId_order_idx" ON "Affirmation"("sessionId", "order");

-- CreateIndex
CREATE INDEX "AffirmationLoop_userId_createdAt_idx" ON "AffirmationLoop"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AffirmationLoop_userId_status_idx" ON "AffirmationLoop"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LoopReminder_loopId_key" ON "LoopReminder"("loopId");

-- CreateIndex
CREATE INDEX "LoopReminder_userId_idx" ON "LoopReminder"("userId");

-- CreateIndex
CREATE INDEX "LoopReminder_isActive_idx" ON "LoopReminder"("isActive");

-- CreateIndex
CREATE INDEX "AffirmationLoopItem_affirmationId_idx" ON "AffirmationLoopItem"("affirmationId");

-- CreateIndex
CREATE UNIQUE INDEX "AffirmationLoopItem_loopId_sortOrder_key" ON "AffirmationLoopItem"("loopId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VisionBoard_categoryId_key" ON "VisionBoard"("categoryId");

-- CreateIndex
CREATE INDEX "VisionBoard_userId_isGloabal_idx" ON "VisionBoard"("userId", "isGloabal");

-- CreateIndex
CREATE INDEX "VisionBoard_userId_name_idx" ON "VisionBoard"("userId", "name");

-- CreateIndex
CREATE INDEX "Vision_visionBoardId_idx" ON "Vision"("visionBoardId");

-- CreateIndex
CREATE INDEX "Vision_reflectionSessionId_idx" ON "Vision"("reflectionSessionId");

-- CreateIndex
CREATE INDEX "Vision_visionBoardId_order_idx" ON "Vision"("visionBoardId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Vision_visionBoardId_reflectionSessionId_key" ON "Vision"("visionBoardId", "reflectionSessionId");

-- CreateIndex
CREATE INDEX "Journal_userId_idx" ON "Journal"("userId");

-- CreateIndex
CREATE INDEX "Journal_userId_createdAt_idx" ON "Journal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Journal_userId_date_idx" ON "Journal"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReflectionSound_reflectionSessionId_key" ON "ReflectionSound"("reflectionSessionId");

-- AddForeignKey
ALTER TABLE "StreakHistory" ADD CONSTRAINT "StreakHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelOfLife" ADD CONSTRAINT "WheelOfLife_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelCategory" ADD CONSTRAINT "WheelCategory_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "WheelOfLife"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelAssessment" ADD CONSTRAINT "WheelAssessment_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "WheelOfLife"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelFocus" ADD CONSTRAINT "WheelFocus_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "WheelOfLife"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelFocus" ADD CONSTRAINT "WheelFocus_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WheelCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelFocus" ADD CONSTRAINT "WheelFocus_wheelAssessmentId_fkey" FOREIGN KEY ("wheelAssessmentId") REFERENCES "WheelAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReflectionSession" ADD CONSTRAINT "ReflectionSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReflectionSession" ADD CONSTRAINT "ReflectionSession_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WheelCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReflectionSession" ADD CONSTRAINT "ReflectionSession_wheelFocusId_fkey" FOREIGN KEY ("wheelFocusId") REFERENCES "WheelFocus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wave" ADD CONSTRAINT "Wave_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReflectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affirmation" ADD CONSTRAINT "Affirmation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReflectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmationLoop" ADD CONSTRAINT "AffirmationLoop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoopReminder" ADD CONSTRAINT "LoopReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoopReminder" ADD CONSTRAINT "LoopReminder_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "AffirmationLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmationLoopItem" ADD CONSTRAINT "AffirmationLoopItem_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "AffirmationLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmationLoopItem" ADD CONSTRAINT "AffirmationLoopItem_affirmationId_fkey" FOREIGN KEY ("affirmationId") REFERENCES "Affirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionBoard" ADD CONSTRAINT "VisionBoard_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WheelCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionBoard" ADD CONSTRAINT "VisionBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vision" ADD CONSTRAINT "Vision_visionBoardId_fkey" FOREIGN KEY ("visionBoardId") REFERENCES "VisionBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vision" ADD CONSTRAINT "Vision_reflectionSessionId_fkey" FOREIGN KEY ("reflectionSessionId") REFERENCES "ReflectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vision" ADD CONSTRAINT "Vision_backgroundSoundId_fkey" FOREIGN KEY ("backgroundSoundId") REFERENCES "VisionBoardSound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReflectionSound" ADD CONSTRAINT "ReflectionSound_reflectionSessionId_fkey" FOREIGN KEY ("reflectionSessionId") REFERENCES "ReflectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

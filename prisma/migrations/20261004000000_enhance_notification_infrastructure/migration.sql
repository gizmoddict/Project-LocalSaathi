-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONVERSATION_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'USER_BLOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_NOTIFICATION';

-- AlterTable notifications
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- Indexes on notifications
CREATE INDEX IF NOT EXISTS "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_expires_at_idx" ON "notifications"("expires_at");

-- AlterTable notification_preferences
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "system_updates" BOOLEAN NOT NULL DEFAULT true;

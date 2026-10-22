-- AlterEnum
ALTER TYPE "ConversationType" ADD VALUE IF NOT EXISTS 'GROUP';
ALTER TYPE "ConversationType" ADD VALUE IF NOT EXISTS 'JOB_RELATED';
ALTER TYPE "ConversationType" ADD VALUE IF NOT EXISTS 'BOOKING_RELATED';

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VOICE';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'JOB';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'BOOKING';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MESSAGE_RECEIVED';

-- AlterEnum
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'CONVERSATION_CREATED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'MESSAGE_CREATED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'MESSAGE_READ';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'MESSAGE_DELETED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'USER_BLOCKED';

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "type" SET DEFAULT 'DIRECT';
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "application_id" UUID;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "booking_id" UUID;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_id" UUID;

-- Indexes on conversations
CREATE INDEX IF NOT EXISTS "conversations_application_id_idx" ON "conversations"("application_id");
CREATE INDEX IF NOT EXISTS "conversations_booking_id_idx" ON "conversations"("booking_id");
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations"("last_message_at" DESC);

-- Foreign keys on conversations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_application_id_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_booking_id_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "last_read_message_id" UUID;
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "muted_at" TIMESTAMP(3);
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "unread_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "conversation_members_user_id_unread_count_idx" ON "conversation_members"("user_id", "unread_count");

-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_message_id" VARCHAR(100);
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "sequence_number" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reply_to_message_id" UUID;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- If content has values, copy to body
UPDATE "messages" SET "body" = "content" WHERE "body" IS NULL AND "content" IS NOT NULL;

-- Indexes on messages
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "messages_conversation_id_sequence_number_idx" ON "messages"("conversation_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages"("sender_id");
CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_id_sender_id_client_message_id_key" ON "messages"("conversation_id", "sender_id", "client_message_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_reply_to_message_id_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "message_updates" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: message_attachments
CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL,
  "file_type" VARCHAR(50) NOT NULL,
  "file_url" TEXT NOT NULL,
  "fileName" VARCHAR(255),
  "file_name" VARCHAR(255),
  "file_size" INTEGER,
  "mime_type" VARCHAR(100),
  "duration" INTEGER,
  "storage_key" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateTable: message_read_receipts
CREATE TABLE IF NOT EXISTS "message_read_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_read_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "message_read_receipts_message_id_user_id_key" ON "message_read_receipts"("message_id", "user_id");
CREATE INDEX IF NOT EXISTS "message_read_receipts_user_id_read_at_idx" ON "message_read_receipts"("user_id", "read_at" DESC);

-- CreateTable: message_reactions
CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "emoji" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_message_id_user_id_emoji_key" ON "message_reactions"("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "message_reactions_message_id_idx" ON "message_reactions"("message_id");

-- CreateTable: user_presences
CREATE TABLE IF NOT EXISTS "user_presences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_presences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_presences_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "user_presences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_presences_user_id_status_idx" ON "user_presences"("user_id", "status");

-- CreateTable: blocked_users
CREATE TABLE IF NOT EXISTS "blocked_users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blocker_id" UUID NOT NULL,
  "blocked_id" UUID NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "blocked_users_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id"),
  CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "blocked_users_blocker_id_idx" ON "blocked_users"("blocker_id");
CREATE INDEX IF NOT EXISTS "blocked_users_blocked_id_idx" ON "blocked_users"("blocked_id");

-- CreateTable: reported_messages
CREATE TABLE IF NOT EXISTS "reported_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporter_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "conversation_id" UUID,
  "reason" VARCHAR(50) NOT NULL,
  "details" TEXT,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reported_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reported_messages_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reported_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "reported_messages_message_id_idx" ON "reported_messages"("message_id");
CREATE INDEX IF NOT EXISTS "reported_messages_reporter_id_idx" ON "reported_messages"("reporter_id");
CREATE INDEX IF NOT EXISTS "reported_messages_status_created_at_idx" ON "reported_messages"("status", "created_at" ASC);

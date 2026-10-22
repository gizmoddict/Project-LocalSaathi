-- Phase 9: Notifications + Domain Events + Operational Event Infrastructure
-- Migration: 20261003030000_add_notification_domain_events

-- 1. Add new PostgreSQL enum types
CREATE TYPE "NotificationType" AS ENUM (
  'APPLICATION_RECEIVED',
  'APPLICATION_SHORTLISTED',
  'APPLICATION_REJECTED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_WITHDRAWN',
  'BOOKING_CREATED',
  'BOOKING_CONFIRMED',
  'BOOKING_STARTED',
  'BOOKING_COMPLETED',
  'BOOKING_CANCELLED',
  'JOB_PUBLISHED',
  'JOB_PAUSED',
  'JOB_RESUMED',
  'JOB_FILLED',
  'JOB_CANCELLED'
);

CREATE TYPE "NotificationPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH'
);

CREATE TYPE "DomainEventType" AS ENUM (
  'APPLICATION_CREATED',
  'APPLICATION_SHORTLISTED',
  'APPLICATION_REJECTED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_WITHDRAWN',
  'BOOKING_CREATED',
  'BOOKING_CONFIRMED',
  'BOOKING_STARTED',
  'BOOKING_COMPLETED',
  'BOOKING_CANCELLED',
  'JOB_PUBLISHED',
  'JOB_PAUSED',
  'JOB_RESUMED',
  'JOB_FILLED',
  'JOB_CANCELLED'
);

CREATE TYPE "DomainEventStatus" AS ENUM (
  'PENDING',
  'PROCESSED',
  'FAILED'
);

-- 2. Extend existing notifications table with new columns
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "entity_type" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "source_event_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- 3. Add partial unique index for idempotency on (source_event_id, recipient_id)
--    Using partial index so NULL source_event_id rows are not constrained
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_event_recipient_unique"
  ON "notifications"("source_event_id", "recipient_id")
  WHERE "source_event_id" IS NOT NULL;

-- 4. Create domain_events table
CREATE TABLE "domain_events" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "type"         "DomainEventType" NOT NULL,
  "status"       "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
  "actor_id"     UUID,
  "entity_type"  VARCHAR(50) NOT NULL,
  "entity_id"    UUID NOT NULL,
  "payload"      JSONB NOT NULL DEFAULT '{}',
  "error_reason" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- FK: actor -> users
ALTER TABLE "domain_events"
  ADD CONSTRAINT "domain_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for domain_events
CREATE INDEX "domain_events_status_created_at_idx"   ON "domain_events"("status", "created_at" ASC);
CREATE INDEX "domain_events_entity_type_entity_id_idx" ON "domain_events"("entity_type", "entity_id");

-- 5. Add FK from notifications.source_event_id -> domain_events.id
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_source_event_id_fkey"
  FOREIGN KEY ("source_event_id") REFERENCES "domain_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Create notification_preferences table
CREATE TABLE "notification_preferences" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              UUID NOT NULL,
  "application_updates"  BOOLEAN NOT NULL DEFAULT TRUE,
  "booking_updates"      BOOLEAN NOT NULL DEFAULT TRUE,
  "job_updates"          BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "notification_preferences_pkey"    PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id")
);

-- FK: notification_preferences.user_id -> users.id
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 10: Transactional Outbox + Async Domain Event Processing + Real-Time Notification Delivery
-- Migration: 20261003040000_add_transactional_outbox_and_event_processing

-- 1. Create new Enums
DO $$ BEGIN
  CREATE TYPE "OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'PROCESSED',
    'FAILED',
    'DEAD_LETTER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
    'CREATED',
    'DELIVERED',
    'READ'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Extend notifications table with delivery status tracking
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "delivery_status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notifications_recipient_delivery_status_idx"
  ON "notifications"("recipient_id", "delivery_status");

-- 3. Create outbox_events table
CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type"     VARCHAR(100) NOT NULL,
  "event_version"  INTEGER NOT NULL DEFAULT 1,
  "aggregate_type" VARCHAR(50) NOT NULL,
  "aggregate_id"   UUID NOT NULL,
  "actor_id"       UUID,
  "payload"        JSONB NOT NULL DEFAULT '{}',
  "metadata"       JSONB,
  "status"         "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count"  INTEGER NOT NULL DEFAULT 0,
  "max_attempts"   INTEGER NOT NULL DEFAULT 5,
  "available_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "processed_at"   TIMESTAMP(3),
  "failed_at"      TIMESTAMP(3),
  "locked_at"      TIMESTAMP(3),
  "locked_by"      VARCHAR(100),
  "last_error"     TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- FK: outbox_events.actor_id -> users.id
ALTER TABLE "outbox_events"
  DROP CONSTRAINT IF EXISTS "outbox_events_actor_id_fkey",
  ADD CONSTRAINT "outbox_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for outbox_events
CREATE INDEX IF NOT EXISTS "outbox_events_status_available_at_created_at_idx"
  ON "outbox_events"("status", "available_at", "created_at" ASC);

CREATE INDEX IF NOT EXISTS "outbox_events_aggregate_type_aggregate_id_idx"
  ON "outbox_events"("aggregate_type", "aggregate_id");

CREATE INDEX IF NOT EXISTS "outbox_events_event_type_created_at_idx"
  ON "outbox_events"("event_type", "created_at" DESC);

-- 4. Create event_processing table for idempotent handler execution
CREATE TABLE IF NOT EXISTS "event_processing" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"      UUID NOT NULL,
  "handler_name"  VARCHAR(100) NOT NULL,
  "status"        VARCHAR(20) NOT NULL DEFAULT 'PROCESSED',
  "processed_at"  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "last_error"    TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "event_processing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_processing_event_id_handler_name_key" UNIQUE ("event_id", "handler_name")
);

-- FK: event_processing.event_id -> outbox_events.id
ALTER TABLE "event_processing"
  DROP CONSTRAINT IF EXISTS "event_processing_event_id_fkey",
  ADD CONSTRAINT "event_processing_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "event_processing_handler_name_status_idx"
  ON "event_processing"("handler_name", "status");

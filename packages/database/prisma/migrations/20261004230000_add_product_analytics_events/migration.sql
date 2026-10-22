-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AnalyticsEventSource" AS ENUM ('SERVER_AUTHORITATIVE', 'CLIENT_INTERACTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" VARCHAR(128) NOT NULL,
    "event_name" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" VARCHAR(128),
    "platform" VARCHAR(32) NOT NULL DEFAULT 'WEB',
    "app_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "source" "AnalyticsEventSource" NOT NULL DEFAULT 'SERVER_AUTHORITATIVE',
    "correlation_id" VARCHAR(128),
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_event_id_key" ON "analytics_events"("event_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_event_name_occurred_at_idx" ON "analytics_events"("event_name", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_user_id_occurred_at_idx" ON "analytics_events"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_anonymous_session_id_occurred_at_idx" ON "analytics_events"("anonymous_session_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_occurred_at_idx" ON "analytics_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_source_occurred_at_idx" ON "analytics_events"("source", "occurred_at" DESC);

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

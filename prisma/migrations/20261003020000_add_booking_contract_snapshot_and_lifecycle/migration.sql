-- AlterTable
ALTER TABLE "bookings"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_CONFIRMATION',
  ALTER COLUMN "scheduled_start" DROP NOT NULL,
  ALTER COLUMN "scheduled_end" DROP NOT NULL,
  ADD COLUMN "job_title" VARCHAR(200),
  ADD COLUMN "job_category" VARCHAR(50),
  ADD COLUMN "agreed_wage" DECIMAL(12, 2),
  ADD COLUMN "wage_type" "WageType",
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE,
  ADD COLUMN "start_time" VARCHAR(10),
  ADD COLUMN "end_time" VARCHAR(10),
  ADD COLUMN "duration_days" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "work_location_address" VARCHAR(255),
  ADD COLUMN "work_location_locality" VARCHAR(100),
  ADD COLUMN "work_location_city" VARCHAR(100),
  ADD COLUMN "work_location_state" VARCHAR(100),
  ADD COLUMN "work_location_pin_code" VARCHAR(10),
  ADD COLUMN "work_location_latitude" DOUBLE PRECISION,
  ADD COLUMN "work_location_longitude" DOUBLE PRECISION,
  ADD COLUMN "worker_name" VARCHAR(100),
  ADD COLUMN "employer_name" VARCHAR(100),
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "started_at" TIMESTAMPTZ(6),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_reason" VARCHAR(500),
  ADD COLUMN "cancelled_by_role" "UserRole";

-- Backfill existing rows with snapshot data
UPDATE "bookings" b
SET 
  "job_title" = j."title",
  "job_category" = j."category",
  "agreed_wage" = b."total_amount",
  "wage_type" = j."wage_type",
  "start_date" = j."start_date",
  "worker_name" = w."display_name",
  "employer_name" = e."business_name",
  "confirmed_at" = b."created_at"
FROM "job_posts" j, "worker_profiles" w, "employer_profiles" e
WHERE b."job_post_id" = j."id"
  AND b."worker_profile_id" = w."id"
  AND b."employer_profile_id" = e."id";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_bookings_job_post_id" ON "bookings"("job_post_id");
CREATE INDEX IF NOT EXISTS "idx_bookings_status_start_date" ON "bookings"("status", "start_date");
CREATE INDEX IF NOT EXISTS "idx_bookings_created_at" ON "bookings"("created_at" DESC);

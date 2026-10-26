-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "worker_profiles" ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "worker_profiles_onboarding_status_idx" ON "worker_profiles"("onboarding_status");

-- AlterTable
ALTER TABLE "worker_locations" ADD COLUMN "address_line" VARCHAR(255);
ALTER TABLE "worker_locations" ADD COLUMN "locality" VARCHAR(100);
ALTER TABLE "worker_locations" ADD COLUMN "city" VARCHAR(100);
ALTER TABLE "worker_locations" ADD COLUMN "state" VARCHAR(100);
ALTER TABLE "worker_locations" ADD COLUMN "pin_code" VARCHAR(10);

-- CreateIndex
CREATE INDEX "worker_locations_city_locality_idx" ON "worker_locations"("city", "locality");

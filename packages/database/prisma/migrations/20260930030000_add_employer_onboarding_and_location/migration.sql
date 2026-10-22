-- AlterTable
ALTER TABLE "employer_profiles" 
ADD COLUMN IF NOT EXISTS "address_line" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "locality" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "city" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "state" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "pin_code" VARCHAR(10),
ADD COLUMN IF NOT EXISTS "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employer_profiles_onboarding_status_idx" ON "employer_profiles"("onboarding_status");

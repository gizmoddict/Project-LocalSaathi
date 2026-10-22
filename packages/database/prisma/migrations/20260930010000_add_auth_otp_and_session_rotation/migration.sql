-- ==============================================================================
-- Migration: Add OTP Challenges & Session Rotation / Reuse Detection
-- ==============================================================================

-- 1. Alter Sessions to support token rotation, reuse detection, and client audit
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "previous_token_hash" VARCHAR(128);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" VARCHAR(45);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "sessions_previous_token_hash_idx" ON "sessions"("previous_token_hash");

-- 2. Create dedicated OTP Challenges table
CREATE TABLE IF NOT EXISTS "otp_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "otp_hash" VARCHAR(128) NOT NULL,
    "purpose" VARCHAR(50) NOT NULL DEFAULT 'LOGIN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes for fast OTP lookup, expiration, and cooldown checks
CREATE INDEX IF NOT EXISTS "otp_challenges_phone_expires_at_idx" ON "otp_challenges"("phone", "expires_at");
CREATE INDEX IF NOT EXISTS "otp_challenges_phone_created_at_idx" ON "otp_challenges"("phone", "created_at" DESC);

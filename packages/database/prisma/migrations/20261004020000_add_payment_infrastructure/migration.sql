-- ==============================================================================
-- Migration: 20261004020000_add_payment_infrastructure
-- Description: Add PaymentAttempt, Refund, Payout models and Payment event types
-- ==============================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentAttemptStatus') THEN
    CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'PENDING_USER_ACTION', 'PROCESSING', 'SUCCESS', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentEventType') THEN
    CREATE TYPE "PaymentEventType" AS ENUM ('ORDER_CREATED', 'PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'REFUND_PROCESSED', 'DISPUTE_CREATED', 'PAYOUT_INITIATED', 'PAYOUT_PROCESSED', 'PAYOUT_FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RefundStatus') THEN
    CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayoutStatus') THEN
    CREATE TYPE "PayoutStatus" AS ENUM ('INITIATED', 'PENDING', 'IN_TRANSIT', 'PAID', 'FAILED', 'CANCELLED');
  END IF;
END $$;

-- 2. Alter DomainEventType and NotificationType
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_INITIATED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_AUTHORIZED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_CAPTURED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYOUT_INITIATED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYOUT_PROCESSED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'PAYOUT_FAILED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_INITIATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_CAPTURED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFUND_PROCESSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT_INITIATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT_COMPLETED';

-- 3. Enhance payments table
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_order_id" VARCHAR(100);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_code" VARCHAR(50);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_reason" VARCHAR(500);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "captured_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payments_booking_id_idx" ON "payments"("booking_id");
CREATE INDEX IF NOT EXISTS "payments_provider_order_id_idx" ON "payments"("provider_order_id");

-- 4. Create payment_attempts table
CREATE TABLE IF NOT EXISTS "payment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "provider_reference" VARCHAR(100),
    "request_payload" JSONB,
    "response_payload" JSONB,
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "payment_attempts_payment_id_attempt_number_idx" ON "payment_attempts"("payment_id", "attempt_number");

-- 5. Enhance payment_events table
ALTER TABLE "payment_events" ADD COLUMN IF NOT EXISTS "payment_id" UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'payment_events_payment_id_fkey'
  ) THEN
    ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" 
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- 6. Create refunds table
CREATE TABLE IF NOT EXISTS "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "reason" VARCHAR(255),
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "provider_refund_id" VARCHAR(100),
    "idempotency_key" VARCHAR(100) NOT NULL,
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refunds_provider_refund_id_key" UNIQUE ("provider_refund_id"),
    CONSTRAINT "refunds_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chk_refund_amount" CHECK ("amount" >= 0)
);

CREATE INDEX IF NOT EXISTS "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

-- 7. Create payouts table
CREATE TABLE IF NOT EXISTS "payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID,
    "worker_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "status" "PayoutStatus" NOT NULL DEFAULT 'INITIATED',
    "provider" VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
    "provider_payout_id" VARCHAR(100),
    "idempotency_key" VARCHAR(100) NOT NULL,
    "failure_reason" VARCHAR(500),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payouts_provider_payout_id_key" UNIQUE ("provider_payout_id"),
    CONSTRAINT "payouts_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payouts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chk_payout_amount" CHECK ("amount" >= 0)
);

CREATE INDEX IF NOT EXISTS "payouts_worker_id_status_idx" ON "payouts"("worker_id", "status");
CREATE INDEX IF NOT EXISTS "payouts_booking_id_idx" ON "payouts"("booking_id");

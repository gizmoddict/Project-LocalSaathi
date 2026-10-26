-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TYPE "VerificationType" ADD VALUE IF NOT EXISTS 'BUSINESS_REGISTRATION';
ALTER TYPE "VerificationType" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'BUSINESS_PROOF';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'ADDRESS_PROOF';

ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'VERIFICATION_SUBMITTED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'VERIFICATION_APPROVED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'VERIFICATION_REJECTED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'USER_REPORTED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'REPORT_RESOLVED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'USER_SUSPENDED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'USER_REINSTATED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'USER_RESTRICTED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'DISPUTE_RAISED';
ALTER TYPE "DomainEventType" ADD VALUE IF NOT EXISTS 'DISPUTE_RESOLVED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VERIFICATION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VERIFICATION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_REINSTATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'USER_RESTRICTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_RAISED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_FILED';

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationCaseType') THEN
    CREATE TYPE "ModerationCaseType" AS ENUM ('REPORT', 'VERIFICATION', 'DISPUTE', 'SAFETY_ALERT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationCaseStatus') THEN
    CREATE TYPE "ModerationCaseStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationPriority') THEN
    CREATE TYPE "ModerationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationActionType') THEN
    CREATE TYPE "ModerationActionType" AS ENUM (
      'NONE',
      'DISMISS',
      'WARNING',
      'CONTENT_REMOVAL',
      'CAPABILITY_RESTRICTION',
      'SUSPENSION',
      'APPROVE_VERIFICATION',
      'REJECT_VERIFICATION',
      'SETTLE_DISPUTE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RestrictionType') THEN
    CREATE TYPE "RestrictionType" AS ENUM (
      'CANNOT_MESSAGE',
      'CANNOT_POST_JOBS',
      'CANNOT_APPLY',
      'CANNOT_ACCEPT_BOOKINGS',
      'TEMPORARY_SUSPENSION'
    );
  END IF;
END $$;

-- AlterTable identity_verifications
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "reviewer_id" UUID;
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'identity_verifications_reviewer_id_fkey'
  ) THEN
    ALTER TABLE "identity_verifications"
      ADD CONSTRAINT "identity_verifications_reviewer_id_fkey"
      FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- AlterTable documents
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "verification_id" UUID;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_verification_id_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_verification_id_fkey"
      FOREIGN KEY ("verification_id") REFERENCES "identity_verifications"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- CreateTable moderation_cases
CREATE TABLE IF NOT EXISTS "moderation_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_number" VARCHAR(50) NOT NULL,
  "case_type" "ModerationCaseType" NOT NULL,
  "priority" "ModerationPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "ModerationCaseStatus" NOT NULL DEFAULT 'PENDING',
  "assigned_to_id" UUID,
  "target_entity_type" VARCHAR(50) NOT NULL,
  "target_entity_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "resolution" "ModerationActionType" NOT NULL DEFAULT 'NONE',
  "resolution_notes" TEXT,
  "resolved_at" TIMESTAMP(3),
  "verification_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderation_cases_case_number_key" ON "moderation_cases"("case_number");
CREATE UNIQUE INDEX IF NOT EXISTS "moderation_cases_verification_id_key" ON "moderation_cases"("verification_id") WHERE "verification_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "moderation_cases_status_priority_created_at_idx" ON "moderation_cases"("status", "priority", "created_at" ASC);
CREATE INDEX IF NOT EXISTS "moderation_cases_case_type_status_idx" ON "moderation_cases"("case_type", "status");
CREATE INDEX IF NOT EXISTS "moderation_cases_target_entity_idx" ON "moderation_cases"("target_entity_type", "target_entity_id");
CREATE INDEX IF NOT EXISTS "moderation_cases_assigned_to_id_status_idx" ON "moderation_cases"("assigned_to_id", "status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'moderation_cases_assigned_to_id_fkey'
  ) THEN
    ALTER TABLE "moderation_cases"
      ADD CONSTRAINT "moderation_cases_assigned_to_id_fkey"
      FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'moderation_cases_verification_id_fkey'
  ) THEN
    ALTER TABLE "moderation_cases"
      ADD CONSTRAINT "moderation_cases_verification_id_fkey"
      FOREIGN KEY ("verification_id") REFERENCES "identity_verifications"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- CreateTable moderation_case_actions
CREATE TABLE IF NOT EXISTS "moderation_case_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL,
  "moderator_id" UUID NOT NULL,
  "action_type" "ModerationActionType" NOT NULL,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_case_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "moderation_case_actions_case_id_created_at_idx" ON "moderation_case_actions"("case_id", "created_at" ASC);
CREATE INDEX IF NOT EXISTS "moderation_case_actions_moderator_id_created_at_idx" ON "moderation_case_actions"("moderator_id", "created_at" DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'moderation_case_actions_case_id_fkey'
  ) THEN
    ALTER TABLE "moderation_case_actions"
      ADD CONSTRAINT "moderation_case_actions_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'moderation_case_actions_moderator_id_fkey'
  ) THEN
    ALTER TABLE "moderation_case_actions"
      ADD CONSTRAINT "moderation_case_actions_moderator_id_fkey"
      FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
END $$;

-- AlterTable reports
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "details" TEXT;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "moderation_case_id" UUID;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "resolved_by_id" UUID;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "action_taken" VARCHAR(50);
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "resolution_notes" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reports_moderation_case_id_fkey'
  ) THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_moderation_case_id_fkey"
      FOREIGN KEY ("moderation_case_id") REFERENCES "moderation_cases"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reports_resolved_by_id_fkey'
  ) THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_resolved_by_id_fkey"
      FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- AlterTable disputes
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "moderation_case_id" UUID;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "resolved_by_id" UUID;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "resolution_notes" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'disputes_moderation_case_id_fkey'
  ) THEN
    ALTER TABLE "disputes"
      ADD CONSTRAINT "disputes_moderation_case_id_fkey"
      FOREIGN KEY ("moderation_case_id") REFERENCES "moderation_cases"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'disputes_resolved_by_id_fkey'
  ) THEN
    ALTER TABLE "disputes"
      ADD CONSTRAINT "disputes_resolved_by_id_fkey"
      FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- CreateTable user_restrictions
CREATE TABLE IF NOT EXISTS "user_restrictions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "restriction_type" "RestrictionType" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "issued_by_id" UUID,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_id" UUID,
  CONSTRAINT "user_restrictions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_restrictions_user_id_is_active_idx" ON "user_restrictions"("user_id", "is_active");
CREATE INDEX IF NOT EXISTS "user_restrictions_restriction_type_is_active_idx" ON "user_restrictions"("restriction_type", "is_active");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_restrictions_user_id_fkey'
  ) THEN
    ALTER TABLE "user_restrictions"
      ADD CONSTRAINT "user_restrictions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_restrictions_issued_by_id_fkey'
  ) THEN
    ALTER TABLE "user_restrictions"
      ADD CONSTRAINT "user_restrictions_issued_by_id_fkey"
      FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_restrictions_revoked_by_id_fkey'
  ) THEN
    ALTER TABLE "user_restrictions"
      ADD CONSTRAINT "user_restrictions_revoked_by_id_fkey"
      FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

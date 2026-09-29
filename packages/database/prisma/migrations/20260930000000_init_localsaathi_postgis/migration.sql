-- ==============================================================================
-- Migration: 20260930000000_init_localsaathi_postgis
-- LocalSaathi PostgreSQL + PostGIS Schema Initializer
-- ==============================================================================

-- 1. Enable Spatial and UUID Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Create Enums
CREATE TYPE "UserRole" AS ENUM ('WORKER', 'EMPLOYER', 'ADMIN', 'MODERATOR', 'SUPPORT');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DELETED');
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "WageType" AS ENUM ('HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE');
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "JobUrgency" AS ENUM ('IMMEDIATE', 'STANDARD', 'FLEXIBLE');
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'BOOKED');
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED');
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'JOB_CONTEXT');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'SYSTEM');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'DISPUTED');
CREATE TYPE "VerificationType" AS ENUM ('AADHAAR', 'PAN', 'DRIVING_LICENSE', 'VOTER_ID', 'PASSPORT');
CREATE TYPE "DocumentType" AS ENUM ('GOVERNMENT_ID', 'TRADE_CERTIFICATE', 'PROFILE_IMAGE', 'WORK_SAMPLE');
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'JOB', 'MESSAGE');
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'RESOLVED', 'CLOSED');
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');
CREATE TYPE "SearchIndexEntityType" AS ENUM ('JOB', 'WORKER');
CREATE TYPE "SearchIndexOperation" AS ENUM ('INDEX', 'UPDATE', 'DELETE');
CREATE TYPE "SearchIndexStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- 3. Create Tables

-- users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'WORKER',
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- worker_profiles
CREATE TABLE "worker_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "profile_photo_key" VARCHAR(255),
    "bio" TEXT,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "expected_wage" DECIMAL(12,2),
    "wage_type" "WageType" NOT NULL DEFAULT 'DAILY',
    "preferred_radius_km" INTEGER NOT NULL DEFAULT 10,
    "languages" TEXT[] DEFAULT ARRAY['en', 'hi']::TEXT[],
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "completed_jobs_count" INTEGER NOT NULL DEFAULT 0,
    "avg_rating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "reliability_score" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "worker_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "worker_profiles_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "chk_worker_expected_wage" CHECK ("expected_wage" IS NULL OR "expected_wage" >= 0),
    CONSTRAINT "chk_worker_experience" CHECK ("experience_years" >= 0),
    CONSTRAINT "chk_worker_radius" CHECK ("preferred_radius_km" > 0)
);

-- employer_profiles
CREATE TABLE "employer_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "business_name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "business_type" VARCHAR(50),
    "contact_preferences" TEXT[] DEFAULT ARRAY['PHONE', 'IN_APP']::TEXT[],
    "verification_state" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "total_jobs_posted" INTEGER NOT NULL DEFAULT 0,
    "total_hires" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "employer_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employer_profiles_user_id_key" UNIQUE ("user_id")
);

-- skills
CREATE TABLE "skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "normalized_name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skills_normalized_name_key" UNIQUE ("normalized_name")
);

-- worker_skills
CREATE TABLE "worker_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "worker_profile_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "proficiency" VARCHAR(20) NOT NULL DEFAULT 'INTERMEDIATE',
    "experience_years" INTEGER NOT NULL DEFAULT 1,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worker_skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "worker_skills_unique" UNIQUE ("worker_profile_id", "skill_id"),
    CONSTRAINT "chk_worker_skill_experience" CHECK ("experience_years" >= 0)
);

-- job_posts
CREATE TABLE "job_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employer_profile_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "category" VARCHAR(50) NOT NULL,
    "wage_type" "WageType" NOT NULL,
    "wage_amount" DECIMAL(12,2) NOT NULL,
    "worker_count" INTEGER NOT NULL DEFAULT 1,
    "duration_days" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "start_time" VARCHAR(10),
    "urgency" "JobUrgency" NOT NULL DEFAULT 'STANDARD',
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language_requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_job_wage_amount" CHECK ("wage_amount" >= 0),
    CONSTRAINT "chk_job_worker_count" CHECK ("worker_count" >= 1),
    CONSTRAINT "chk_job_duration" CHECK ("duration_days" >= 1)
);

-- job_required_skills
CREATE TABLE "job_required_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_post_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "min_experience_years" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_required_skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_required_skills_unique" UNIQUE ("job_post_id", "skill_id"),
    CONSTRAINT "chk_job_req_skill_exp" CHECK ("min_experience_years" >= 0)
);

-- job_locations
CREATE TABLE "job_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_post_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "address_line" VARCHAR(255),
    "locality" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "pin_code" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_locations_job_post_id_key" UNIQUE ("job_post_id"),
    CONSTRAINT "chk_job_lat" CHECK ("latitude" >= -90 AND "latitude" <= 90),
    CONSTRAINT "chk_job_lng" CHECK ("longitude" >= -180 AND "longitude" <= 180)
);

-- worker_locations
CREATE TABLE "worker_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "worker_profile_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "accuracy_meters" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worker_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "worker_locations_worker_profile_id_key" UNIQUE ("worker_profile_id"),
    CONSTRAINT "chk_worker_lat" CHECK ("latitude" >= -90 AND "latitude" <= 90),
    CONSTRAINT "chk_worker_lng" CHECK ("longitude" >= -180 AND "longitude" <= 180)
);

-- availability
CREATE TABLE "availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "worker_profile_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(10),
    "end_time" VARCHAR(10),
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "availability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "availability_worker_date_unique" UNIQUE ("worker_profile_id", "date")
);

-- job_applications
CREATE TABLE "job_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_post_id" UUID NOT NULL,
    "worker_profile_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "decision_notes" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_applications_unique" UNIQUE ("job_post_id", "worker_profile_id")
);

-- bookings
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_post_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "employer_profile_id" UUID NOT NULL,
    "worker_profile_id" UUID NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookings_application_id_key" UNIQUE ("application_id"),
    CONSTRAINT "chk_booking_total_amount" CHECK ("total_amount" >= 0)
);

-- conversations
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ConversationType" NOT NULL DEFAULT 'JOB_CONTEXT',
    "job_post_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- conversation_members
CREATE TABLE "conversation_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),
    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_members_unique" UNIQUE ("conversation_id", "user_id")
);

-- messages
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "message_type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "attachment_key" VARCHAR(255),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- notifications
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- ratings
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewer_id" UUID NOT NULL,
    "reviewed_user_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "review" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ratings_booking_reviewer_unique" UNIQUE ("booking_id", "reviewer_id"),
    CONSTRAINT "chk_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5),
    CONSTRAINT "chk_prevent_self_rating" CHECK ("reviewer_id" != "reviewed_user_id")
);

-- payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payer_id" UUID NOT NULL,
    "payee_id" UUID,
    "booking_id" UUID,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
    "provider_payment_id" VARCHAR(100),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_provider_payment_id_key" UNIQUE ("provider_payment_id"),
    CONSTRAINT "payments_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "chk_payment_amount" CHECK ("amount" >= 0)
);

-- payment_events
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
    "event_id" VARCHAR(150) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_events_event_id_key" UNIQUE ("event_id")
);

-- identity_verifications
CREATE TABLE "identity_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "verification_type" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_reference" VARCHAR(100),
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- documents
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "object_storage_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- reports
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- disputes
CREATE TABLE "disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "raised_by_id" UUID NOT NULL,
    "against_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- audit_logs
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- sessions
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_token_hash" VARCHAR(128) NOT NULL,
    "device_info" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_session_token_hash_key" UNIQUE ("session_token_hash")
);

-- user_devices
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" VARCHAR(100) NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "push_token_hash" VARCHAR(128),
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_devices_unique" UNIQUE ("user_id", "device_id")
);

-- search_index_events
CREATE TABLE "search_index_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "SearchIndexEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation" "SearchIndexOperation" NOT NULL,
    "status" "SearchIndexStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_index_events_pkey" PRIMARY KEY ("id")
);

-- 4. Foreign Key Constraints
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_skills" ADD CONSTRAINT "worker_skills_worker_profile_id_fkey" FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_skills" ADD CONSTRAINT "worker_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_employer_profile_id_fkey" FOREIGN KEY ("employer_profile_id") REFERENCES "employer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_required_skills" ADD CONSTRAINT "job_required_skills_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_required_skills" ADD CONSTRAINT "job_required_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_locations" ADD CONSTRAINT "job_locations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_locations" ADD CONSTRAINT "worker_locations_worker_profile_id_fkey" FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "availability" ADD CONSTRAINT "availability_worker_profile_id_fkey" FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_worker_profile_id_fkey" FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_employer_profile_id_fkey" FOREIGN KEY ("employer_profile_id") REFERENCES "employer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_worker_profile_id_fkey" FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewed_user_id_fkey" FOREIGN KEY ("reviewed_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_against_id_fkey" FOREIGN KEY ("against_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Standard & Composite Indexes
CREATE INDEX "users_role_account_status_idx" ON "users"("role", "account_status");
CREATE INDEX "users_created_at_idx" ON "users"("created_at" DESC);
CREATE INDEX "worker_profiles_is_available_avg_rating_idx" ON "worker_profiles"("is_available", "avg_rating" DESC);
CREATE INDEX "worker_profiles_expected_wage_idx" ON "worker_profiles"("expected_wage");
CREATE INDEX "employer_profiles_business_name_idx" ON "employer_profiles"("business_name");
CREATE INDEX "skills_category_is_active_idx" ON "skills"("category", "is_active");
CREATE INDEX "worker_skills_skill_id_is_verified_idx" ON "worker_skills"("skill_id", "is_verified");
CREATE INDEX "job_posts_status_category_published_at_idx" ON "job_posts"("status", "category", "published_at" DESC);
CREATE INDEX "job_posts_employer_profile_id_status_idx" ON "job_posts"("employer_profile_id", "status");
CREATE INDEX "job_posts_start_date_idx" ON "job_posts"("start_date" ASC);
CREATE INDEX "job_required_skills_skill_id_is_required_idx" ON "job_required_skills"("skill_id", "is_required");
CREATE INDEX "job_locations_city_locality_idx" ON "job_locations"("city", "locality");
CREATE INDEX "worker_locations_is_active_updated_at_idx" ON "worker_locations"("is_active", "updated_at" DESC);
CREATE INDEX "availability_worker_profile_id_date_status_idx" ON "availability"("worker_profile_id", "date", "status");
CREATE INDEX "job_applications_job_post_id_status_idx" ON "job_applications"("job_post_id", "status");
CREATE INDEX "job_applications_worker_profile_id_status_idx" ON "job_applications"("worker_profile_id", "status");
CREATE INDEX "bookings_employer_profile_id_status_idx" ON "bookings"("employer_profile_id", "status");
CREATE INDEX "bookings_worker_profile_id_status_idx" ON "bookings"("worker_profile_id", "status");
CREATE INDEX "bookings_scheduled_start_idx" ON "bookings"("scheduled_start" ASC);
CREATE INDEX "conversations_job_post_id_idx" ON "conversations"("job_post_id");
CREATE INDEX "conversation_members_user_id_joined_at_idx" ON "conversation_members"("user_id", "joined_at" DESC);
CREATE INDEX "messages_conversation_id_sent_at_idx" ON "messages"("conversation_id", "sent_at" DESC);
CREATE INDEX "notifications_recipient_id_is_read_created_at_idx" ON "notifications"("recipient_id", "is_read", "created_at" DESC);
CREATE INDEX "ratings_reviewed_user_id_rating_idx" ON "ratings"("reviewed_user_id", "rating");
CREATE INDEX "payments_payer_id_status_idx" ON "payments"("payer_id", "status");
CREATE INDEX "payments_payee_id_status_idx" ON "payments"("payee_id", "status");
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at" DESC);
CREATE INDEX "payment_events_provider_event_type_idx" ON "payment_events"("provider", "event_type");
CREATE INDEX "payment_events_is_processed_received_at_idx" ON "payment_events"("is_processed", "received_at" ASC);
CREATE INDEX "identity_verifications_user_id_status_idx" ON "identity_verifications"("user_id", "status");
CREATE INDEX "documents_owner_id_type_idx" ON "documents"("owner_id", "type");
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at" ASC);
CREATE INDEX "disputes_booking_id_idx" ON "disputes"("booking_id");
CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at" ASC);
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "user_devices_user_id_platform_idx" ON "user_devices"("user_id", "platform");
CREATE INDEX "search_index_events_status_available_at_idx" ON "search_index_events"("status", "available_at" ASC);
CREATE INDEX "search_index_events_entity_type_entity_id_idx" ON "search_index_events"("entity_type", "entity_id");

-- 6. PostGIS Spatial GiST Indexes
CREATE INDEX "idx_job_locations_location_gist" ON "job_locations" USING GIST ("location");
CREATE INDEX "idx_worker_locations_location_gist" ON "worker_locations" USING GIST ("location");

-- 7. PostGIS Synchronization Triggers
-- Automatically populates location geography from longitude & latitude upon INSERT/UPDATE
CREATE OR REPLACE FUNCTION fn_sync_point_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_job_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON "job_locations"
FOR EACH ROW EXECUTE FUNCTION fn_sync_point_location();

CREATE TRIGGER trg_sync_worker_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON "worker_locations"
FOR EACH ROW EXECUTE FUNCTION fn_sync_point_location();

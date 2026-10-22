-- ==============================================================================
-- LocalSaathi — Performance Indexes Migration (Phase 18)
-- Justified by EXPLAIN ANALYZE Query Plans:
-- 1. Accelerates PostGIS Spatial Job Discovery joins with job_posts
-- 2. Accelerates Active Published Job queries
-- 3. Accelerates Session activity queries (DAU/MAU)
-- ==============================================================================

-- 1. Partial Index on active published jobs for spatial candidate joins
CREATE INDEX IF NOT EXISTS "idx_job_posts_active_published" 
ON "job_posts" ("id", "status") 
WHERE ("status" = 'PUBLISHED' AND "deleted_at" IS NULL);

-- 2. Partial Index for recent active jobs feed & sorting
CREATE INDEX IF NOT EXISTS "idx_job_posts_status_deleted_created" 
ON "job_posts" ("status", "created_at" DESC) 
WHERE ("deleted_at" IS NULL);

-- 3. Partial Index on unrevoked active sessions for distinct user tracking
CREATE INDEX IF NOT EXISTS "idx_sessions_user_last_used_active" 
ON "sessions" ("last_used_at" DESC, "user_id") 
WHERE ("revoked_at" IS NULL);

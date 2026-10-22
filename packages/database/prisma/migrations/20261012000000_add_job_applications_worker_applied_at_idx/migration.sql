-- ==============================================================================
-- LocalSaathi — Phase 27: Database Index Scalability Migration
-- Accelerates worker application history listing queries (ORDER BY applied_at DESC)
-- Supported Query:
--   SELECT * FROM job_applications 
--   WHERE worker_profile_id = $1 
--   ORDER BY applied_at DESC 
--   LIMIT $2;
-- ==============================================================================

-- Safe additive index creation:
CREATE INDEX IF NOT EXISTS "job_applications_worker_profile_id_applied_at_idx" 
ON "job_applications" ("worker_profile_id", "applied_at" DESC);

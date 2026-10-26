-- AlterTable
ALTER TABLE "job_applications"
  ADD COLUMN "application_message" TEXT,
  ADD COLUMN "shortlisted_at" TIMESTAMP(3),
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "accepted_at" TIMESTAMP(3),
  ADD COLUMN "withdrawn_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "job_applications_job_post_id_idx" ON "job_applications"("job_post_id");
CREATE INDEX "job_applications_worker_profile_id_idx" ON "job_applications"("worker_profile_id");
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");
CREATE INDEX "job_applications_created_at_idx" ON "job_applications"("created_at" DESC);

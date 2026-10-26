// ==============================================================================
// LocalSaathi — Admin Operations Dashboard Validation Schemas (Phase 15)
// Zod Schemas for Queries, Pagination Bounds & Administrative Actions
// ==============================================================================

import { z } from 'zod';
import {
  UserRole,
  AccountStatus,
  VerificationStatus,
  JobStatus,
  ReportStatus,
  ReportTargetType,
  DisputeStatus,
  ModerationCaseStatus,
  ModerationPriority,
  ModerationCaseType,
} from '@localsaathi/types';

// Pagination helper: bounded 1 to 100, default page 1, default limit 20
export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ------------------------------------------------------------------------------
// 1. User Management Schemas
// ------------------------------------------------------------------------------

export const adminUserQuerySchema = adminPaginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  accountStatus: z.nativeEnum(AccountStatus).optional(),
  verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const adminSuspendUserSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
  internalNotes: z.string().trim().max(1000).optional(),
});

export const adminReinstateUserSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
  internalNotes: z.string().trim().max(1000).optional(),
});

// ------------------------------------------------------------------------------
// 2. Worker & Employer Schemas
// ------------------------------------------------------------------------------

export const adminWorkerQuerySchema = adminPaginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  isAvailable: z.coerce.boolean().optional(),
  verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  city: z.string().trim().max(100).optional(),
  skill: z.string().trim().max(100).optional(),
});

export const adminEmployerQuerySchema = adminPaginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  accountStatus: z.nativeEnum(AccountStatus).optional(),
  verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  city: z.string().trim().max(100).optional(),
});

// ------------------------------------------------------------------------------
// 3. Job Management Schemas
// ------------------------------------------------------------------------------

export const adminJobQuerySchema = adminPaginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.nativeEnum(JobStatus).optional(),
  category: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const pauseJobSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
});

// ------------------------------------------------------------------------------
// 4. Operations: Reports, Disputes, Verifications, Moderation
// ------------------------------------------------------------------------------

export const adminReportQuerySchema = adminPaginationSchema.extend({
  status: z.nativeEnum(ReportStatus).optional(),
  targetType: z.nativeEnum(ReportTargetType).optional(),
});

export const adminDisputeQuerySchema = adminPaginationSchema.extend({
  status: z.nativeEnum(DisputeStatus).optional(),
});

export const adminVerificationQuerySchema = adminPaginationSchema.extend({
  status: z.nativeEnum(VerificationStatus).optional(),
});

export const adminModerationQuerySchema = adminPaginationSchema.extend({
  status: z.nativeEnum(ModerationCaseStatus).optional(),
  priority: z.nativeEnum(ModerationPriority).optional(),
  caseType: z.nativeEnum(ModerationCaseType).optional(),
});

// ------------------------------------------------------------------------------
// 5. Payments Query Schema
// ------------------------------------------------------------------------------

export const adminPaymentQuerySchema = adminPaginationSchema.extend({
  status: z.enum(['INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'DISPUTED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ------------------------------------------------------------------------------
// 6. Audit Log Query Schema
// ------------------------------------------------------------------------------

export const adminAuditLogQuerySchema = adminPaginationSchema.extend({
  actorId: z.string().uuid().optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ------------------------------------------------------------------------------
// 7. Date Filter Overview Schema
// ------------------------------------------------------------------------------

export const adminOverviewQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

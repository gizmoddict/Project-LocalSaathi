// ==============================================================================
// LocalSaathi — Admin Operations Dashboard Constants (Phase 15)
// ==============================================================================

import { UserRole, AdminCapability } from '@localsaathi/types';

export const ADMIN_ROLE_CAPABILITIES: Record<UserRole, AdminCapability[]> = {
  [UserRole.ADMIN]: [
    AdminCapability.VIEW_METRICS,
    AdminCapability.VIEW_USERS,
    AdminCapability.MANAGE_USERS,
    AdminCapability.VIEW_WORKERS,
    AdminCapability.VIEW_EMPLOYERS,
    AdminCapability.VIEW_JOBS,
    AdminCapability.MANAGE_JOBS,
    AdminCapability.VIEW_REPORTS,
    AdminCapability.MANAGE_REPORTS,
    AdminCapability.VIEW_DISPUTES,
    AdminCapability.MANAGE_DISPUTES,
    AdminCapability.VIEW_VERIFICATIONS,
    AdminCapability.MANAGE_VERIFICATIONS,
    AdminCapability.VIEW_MODERATION,
    AdminCapability.MANAGE_MODERATION,
    AdminCapability.VIEW_PAYMENTS,
    AdminCapability.MANAGE_PAYMENTS,
    AdminCapability.VIEW_AUDIT_LOGS,
    AdminCapability.VIEW_SYSTEM_HEALTH,
    AdminCapability.VIEW_ANALYTICS,
  ],
  [UserRole.MODERATOR]: [
    AdminCapability.VIEW_METRICS,
    AdminCapability.VIEW_USERS,
    AdminCapability.VIEW_WORKERS,
    AdminCapability.VIEW_EMPLOYERS,
    AdminCapability.VIEW_JOBS,
    AdminCapability.MANAGE_JOBS,
    AdminCapability.VIEW_REPORTS,
    AdminCapability.MANAGE_REPORTS,
    AdminCapability.VIEW_DISPUTES,
    AdminCapability.MANAGE_DISPUTES,
    AdminCapability.VIEW_VERIFICATIONS,
    AdminCapability.MANAGE_VERIFICATIONS,
    AdminCapability.VIEW_MODERATION,
    AdminCapability.MANAGE_MODERATION,
    AdminCapability.VIEW_ANALYTICS,
  ],
  [UserRole.SUPPORT]: [
    AdminCapability.VIEW_METRICS,
    AdminCapability.VIEW_USERS,
    AdminCapability.VIEW_WORKERS,
    AdminCapability.VIEW_EMPLOYERS,
    AdminCapability.VIEW_JOBS,
    AdminCapability.VIEW_REPORTS,
    AdminCapability.VIEW_DISPUTES,
    AdminCapability.VIEW_VERIFICATIONS,
  ],
  [UserRole.WORKER]: [],
  [UserRole.EMPLOYER]: [],
};

export const ADMIN_ERROR_CODES = {
  UNAUTHORIZED_ACCESS: 'ADMIN_UNAUTHORIZED_ACCESS',
  CAPABILITY_DENIED: 'ADMIN_CAPABILITY_DENIED',
  USER_NOT_FOUND: 'ADMIN_USER_NOT_FOUND',
  JOB_NOT_FOUND: 'ADMIN_JOB_NOT_FOUND',
  CASE_NOT_FOUND: 'ADMIN_CASE_NOT_FOUND',
  INVALID_OPERATION: 'ADMIN_INVALID_OPERATION',
  CANNOT_SUSPEND_ADMIN: 'ADMIN_CANNOT_SUSPEND_ADMIN',
} as const;

export const ADMIN_PAGINATION_LIMITS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const DEFAULT_ADMIN_PAGE_SIZE = ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT;
export const MAX_ADMIN_PAGE_SIZE = ADMIN_PAGINATION_LIMITS.MAX_LIMIT;
export const ADMIN_CAPABILITIES = ADMIN_ROLE_CAPABILITIES;

/**
 * Supported User Roles across LocalSaathi platform.
 */
export enum UserRole {
  WORKER = 'WORKER',
  EMPLOYER = 'EMPLOYER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  SUPPORT = 'SUPPORT',
}

/**
 * Account lifecycle states.
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

/**
 * Verification state for workers and employers.
 */
export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

/**
 * Authenticated user token payload shape.
 */
export interface AuthUserPayload {
  userId: string;
  phone: string;
  roles: UserRole[];
  status: AccountStatus;
  sessionId: string;
}

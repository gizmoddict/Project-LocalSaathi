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
  UNDER_REVIEW = 'UNDER_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Minimal JWT payload for access tokens.
 * Strict privacy: no phone, profile data, or sensitive PII inside the JWT.
 */
export interface JwtAccessTokenPayload {
  sub: string;       // user ID
  sessionId: string; // active session UUID
  role: UserRole;    // primary role enum
  iat?: number;
  exp?: number;
}

/**
 * Authenticated user object populated on HTTP request by AuthGuard.
 */
export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role: UserRole;
}

/**
 * Authenticated user self-profile response (/auth/me).
 * Strict minimal exposure: id, role, accountStatus, verificationStatus, createdAt.
 */
export interface UserSelfProfile {
  id: string;
  role: UserRole;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
}

/**
 * Session metadata response for /auth/sessions.
 */
export interface UserSessionInfo {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}


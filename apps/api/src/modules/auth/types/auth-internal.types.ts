import { UserRole, AccountStatus, VerificationStatus } from '@localsaathi/types';

/**
 * Result of successful OTP verification and token issuance.
 */
export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: UserRole;
    accountStatus: AccountStatus;
    verificationStatus: VerificationStatus;
    createdAt: string;
  };
}

/**
 * Generic response for OTP operations (preventing account enumeration).
 */
export interface GenericOtpResponse {
  success: boolean;
  message: string;
}

/**
 * Session metadata object for internal token service operations.
 */
export interface SessionContext {
  id: string;
  userId: string;
  deviceInfo?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
}

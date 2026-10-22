import { VerificationStatus, UserRole, AccountStatus } from './user.types';

export { VerificationStatus };

export enum VerificationType {
  AADHAAR = 'AADHAAR',
  PAN = 'PAN',
  DRIVING_LICENSE = 'DRIVING_LICENSE',
  VOTER_ID = 'VOTER_ID',
  PASSPORT = 'PASSPORT',
  BUSINESS_REGISTRATION = 'BUSINESS_REGISTRATION',
  OTHER = 'OTHER',
}

export enum DocumentType {
  GOVERNMENT_ID = 'GOVERNMENT_ID',
  TRADE_CERTIFICATE = 'TRADE_CERTIFICATE',
  PROFILE_IMAGE = 'PROFILE_IMAGE',
  WORK_SAMPLE = 'WORK_SAMPLE',
  BUSINESS_PROOF = 'BUSINESS_PROOF',
  ADDRESS_PROOF = 'ADDRESS_PROOF',
}

export enum ReportTargetType {
  USER = 'USER',
  JOB = 'JOB',
  MESSAGE = 'MESSAGE',
}

import { ReportReason } from './messaging.types';
export { ReportReason };

export enum ReportStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
  ESCALATED = 'ESCALATED',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  ESCALATED = 'ESCALATED',
}

export enum ModerationCaseType {
  REPORT = 'REPORT',
  VERIFICATION = 'VERIFICATION',
  DISPUTE = 'DISPUTE',
  SAFETY_ALERT = 'SAFETY_ALERT',
}

export enum ModerationCaseStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
  ESCALATED = 'ESCALATED',
}

export enum ModerationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ModerationActionType {
  NONE = 'NONE',
  DISMISS = 'DISMISS',
  WARNING = 'WARNING',
  CONTENT_REMOVAL = 'CONTENT_REMOVAL',
  CAPABILITY_RESTRICTION = 'CAPABILITY_RESTRICTION',
  SUSPENSION = 'SUSPENSION',
  APPROVE_VERIFICATION = 'APPROVE_VERIFICATION',
  REJECT_VERIFICATION = 'REJECT_VERIFICATION',
  SETTLE_DISPUTE = 'SETTLE_DISPUTE',
}

export enum RestrictionType {
  CANNOT_MESSAGE = 'CANNOT_MESSAGE',
  CANNOT_POST_JOBS = 'CANNOT_POST_JOBS',
  CANNOT_APPLY = 'CANNOT_APPLY',
  CANNOT_ACCEPT_BOOKINGS = 'CANNOT_ACCEPT_BOOKINGS',
  TEMPORARY_SUSPENSION = 'TEMPORARY_SUSPENSION',
}

// Data Transfer Objects & Interfaces

export interface DocumentMetadataItem {
  id: string;
  type: DocumentType;
  objectStorageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  verificationStatus: VerificationStatus;
  rejectionReason?: string | null;
  createdAt: string;
}

export interface VerificationSubmissionDto {
  verificationType: VerificationType;
  providerReference?: string;
  documents: {
    type: DocumentType;
    objectStorageKey: string;
    mimeType: string;
    fileSizeBytes: number;
  }[];
}

export interface VerificationRequestItem {
  id: string;
  userId: string;
  verificationType: VerificationType;
  status: VerificationStatus;
  providerReference?: string | null;
  reviewerId?: string | null;
  notes?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  documents: DocumentMetadataItem[];
  user?: {
    id: string;
    phone: string;
    role: UserRole;
    accountStatus: AccountStatus;
    displayName?: string;
  };
}

export interface CreateReportDto {
  reason: string;
  details?: string;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
  status: ReportStatus;
  moderationCaseId?: string | null;
  actionTaken?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface CreateDisputeDto {
  reason: string;
  description?: string;
}

export interface DisputeItem {
  id: string;
  bookingId: string;
  raisedById: string;
  againstId: string;
  reason: string;
  description?: string | null;
  status: DisputeStatus;
  resolution?: string | null;
  resolutionNotes?: string | null;
  moderationCaseId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  booking?: {
    id: string;
    jobTitle?: string;
    status: string;
    wageAmount: number;
  };
}

export interface ModerationCaseItem {
  id: string;
  caseNumber: string;
  caseType: ModerationCaseType;
  priority: ModerationPriority;
  status: ModerationCaseStatus;
  assignedToId?: string | null;
  targetEntityType: string;
  targetEntityId: string;
  title: string;
  description?: string | null;
  resolution: ModerationActionType;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reports?: ReportItem[];
  disputes?: DisputeItem[];
  actions?: ModerationCaseActionItem[];
}

export interface ModerationCaseActionItem {
  id: string;
  caseId: string;
  moderatorId: string;
  actionType: ModerationActionType;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface UserRestrictionItem {
  id: string;
  userId: string;
  restrictionType: RestrictionType;
  isActive: boolean;
  reason: string;
  issuedById?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  revokedAt?: string | null;
  revokedById?: string | null;
}

export interface TrustSafetyAuditLogItem {
  id: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

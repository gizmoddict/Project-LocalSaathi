// ==============================================================================
// LocalSaathi — Admin Operations Dashboard Types (Phase 15)
// Operational Data Models, Metrics, Audit Records & RBAC Capabilities
// ==============================================================================

import {
  UserRole,
  AccountStatus,
  VerificationStatus,
  JobStatus,
  PaymentStatus,
  ReportStatus,
  ReportTargetType,
  DisputeStatus,
  ModerationCaseStatus,
  ModerationPriority,
  ModerationCaseType,
  DocumentType,
} from './index';

// ------------------------------------------------------------------------------
// 1. RBAC & CAPABILITIES
// ------------------------------------------------------------------------------

export enum AdminCapability {
  VIEW_METRICS = 'VIEW_METRICS',
  VIEW_USERS = 'VIEW_USERS',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_WORKERS = 'VIEW_WORKERS',
  VIEW_EMPLOYERS = 'VIEW_EMPLOYERS',
  VIEW_JOBS = 'VIEW_JOBS',
  MANAGE_JOBS = 'MANAGE_JOBS',
  VIEW_REPORTS = 'VIEW_REPORTS',
  MANAGE_REPORTS = 'MANAGE_REPORTS',
  VIEW_DISPUTES = 'VIEW_DISPUTES',
  MANAGE_DISPUTES = 'MANAGE_DISPUTES',
  VIEW_VERIFICATIONS = 'VIEW_VERIFICATIONS',
  MANAGE_VERIFICATIONS = 'MANAGE_VERIFICATIONS',
  VIEW_MODERATION = 'VIEW_MODERATION',
  MANAGE_MODERATION = 'MANAGE_MODERATION',
  VIEW_PAYMENTS = 'VIEW_PAYMENTS',
  MANAGE_PAYMENTS = 'MANAGE_PAYMENTS',
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  VIEW_SYSTEM_HEALTH = 'VIEW_SYSTEM_HEALTH',
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
}

// ------------------------------------------------------------------------------
// 2. DASHBOARD KPI METRICS
// ------------------------------------------------------------------------------

export interface AdminOverviewMetrics {
  // User Activity
  dau: number;
  mau: number;
  registeredWorkers: number;
  registeredEmployers: number;
  activeWorkers: number;
  activeEmployers: number;

  // Jobs & Applications
  activeJobs: number;
  jobsCreated: number;
  jobsCompleted: number;
  totalApplications: number;
  applicationToHireRate: number; // percentage (0-100)
  matchRate: number;             // applications per active job post
  bookingCompletionRate: number; // percentage (0-100)
  avgResponseTimeHours: number;  // average hours from application to review

  // Payments & Financials
  totalPaymentVolumeInr: number;
  successfulPaymentsCount: number;
  failedPaymentsCount: number;
  totalRefundsVolumeInr: number;
  successfulRefundsCount: number;

  // Trust, Safety & Operations
  totalReportsCount: number;
  suspendedUsersCount: number;
  activeDisputesCount: number;
  pendingVerificationsCount: number;
  pendingModerationCasesCount: number;

  timestamp: string;
}

// ------------------------------------------------------------------------------
// 3. USER MANAGEMENT
// ------------------------------------------------------------------------------

export interface AdminUserItem {
  id: string;
  phone: string;
  role: UserRole;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
  lastActiveAt?: string | null;
  workerProfile?: {
    displayName: string;
    completedJobsCount: number;
    avgRating: number;
  } | null;
  employerProfile?: {
    businessName: string;
    totalJobsPosted: number;
    totalHires: number;
  } | null;
  activeRestrictionsCount: number;
  reportsFiledCount: number;
}

export interface AdminUserDetail extends AdminUserItem {
  restrictions: Array<{
    id: string;
    restrictionType: string;
    reason: string;
    isActive: boolean;
    createdAt: string;
    expiresAt?: string | null;
  }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }>;
}

export interface AdminUserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  accountStatus?: AccountStatus;
  verificationStatus?: VerificationStatus;
  startDate?: string;
  endDate?: string;
}

export interface SuspendUserDto {
  reason: string;
  internalNotes?: string;
}

export interface ReinstateUserDto {
  reason: string;
  internalNotes?: string;
}

// ------------------------------------------------------------------------------
// 4. WORKER MANAGEMENT
// ------------------------------------------------------------------------------

export interface AdminWorkerItem {
  id: string;
  userId: string;
  displayName: string;
  experienceYears: number;
  expectedWage: number | null;
  wageType: string;
  isAvailable: boolean;
  onboardingStatus: string;
  verificationStatus: VerificationStatus;
  avgRating: number;
  ratingCount: number;
  completedJobsCount: number;
  activeBookingsCount: number;
  skills: string[];
  locality?: string | null;
  city?: string | null;
  createdAt: string;
}

export interface AdminWorkerQuery {
  page?: number;
  limit?: number;
  search?: string;
  isAvailable?: boolean;
  verificationStatus?: VerificationStatus;
  city?: string;
  skill?: string;
}

// ------------------------------------------------------------------------------
// 5. EMPLOYER MANAGEMENT
// ------------------------------------------------------------------------------

export interface AdminEmployerItem {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  totalJobsPosted: number;
  totalHires: number;
  activeJobsCount: number;
  activeBookingsCount: number;
  totalPaymentsVolumeInr: number;
  city?: string | null;
  state?: string | null;
  createdAt: string;
}

export interface AdminEmployerQuery {
  page?: number;
  limit?: number;
  search?: string;
  accountStatus?: AccountStatus;
  verificationStatus?: VerificationStatus;
  city?: string;
}

// ------------------------------------------------------------------------------
// 6. JOB MANAGEMENT
// ------------------------------------------------------------------------------

export interface AdminJobItem {
  id: string;
  title: string;
  category: string;
  employerId: string;
  employerBusinessName: string;
  status: JobStatus;
  wageAmount: number;
  wageType: string;
  workerCount: number;
  applicationsCount: number;
  reportsCount: number;
  locality?: string | null;
  city?: string | null;
  createdAt: string;
}

export interface AdminJobQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: JobStatus;
  category?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
}

export interface PauseJobDto {
  reason: string;
}

// ------------------------------------------------------------------------------
// 7. TRUST & SAFETY: REPORTS, DISPUTES, VERIFICATIONS, MODERATION
// ------------------------------------------------------------------------------

export interface AdminReportItem {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  moderationCaseId?: string | null;
  actionTaken?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AdminReportQuery {
  page?: number;
  limit?: number;
  status?: ReportStatus;
  targetType?: ReportTargetType;
}

export interface AdminDisputeItem {
  id: string;
  bookingId: string;
  raisedById: string;
  againstId: string;
  reason: string;
  status: DisputeStatus;
  moderationCaseId?: string | null;
  resolvedById?: string | null;
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AdminDisputeQuery {
  page?: number;
  limit?: number;
  status?: DisputeStatus;
}

export interface AdminVerificationItem {
  id: string;
  userId: string;
  userPhone: string;
  userRole: UserRole;
  verificationType: string;
  status: VerificationStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  documents: Array<{
    id: string;
    type: DocumentType;
    mimeType: string;
    fileSizeBytes: number;
    verificationStatus: VerificationStatus;
    createdAt: string;
  }>;
}

export interface AdminVerificationQuery {
  page?: number;
  limit?: number;
  status?: VerificationStatus;
}

export interface AdminModerationItem {
  id: string;
  caseNumber: string;
  caseType: ModerationCaseType;
  priority: ModerationPriority;
  status: ModerationCaseStatus;
  title: string;
  targetEntityType: string;
  targetEntityId: string;
  assignedToId?: string | null;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AdminModerationQuery {
  page?: number;
  limit?: number;
  status?: ModerationCaseStatus;
  priority?: ModerationPriority;
  caseType?: ModerationCaseType;
}

// ------------------------------------------------------------------------------
// 8. PAYMENTS
// ------------------------------------------------------------------------------

export interface AdminPaymentItem {
  id: string;
  bookingId?: string | null;
  payerId: string;
  payeeId?: string | null;
  amount: number;
  currency: string;
  provider: string;
  providerOrderId?: string | null;
  status: PaymentStatus;
  refundedAmount: number;
  capturedAt?: string | null;
  createdAt: string;
}

export interface AdminPaymentQuery {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  startDate?: string;
  endDate?: string;
}

// ------------------------------------------------------------------------------
// 9. AUDIT LOGS
// ------------------------------------------------------------------------------

export interface AdminAuditLogItem {
  id: string;
  actorId?: string | null;
  actorPhone?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditLogQuery {
  page?: number;
  limit?: number;
  actorId?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

// ------------------------------------------------------------------------------
// 10. SYSTEM HEALTH
// ------------------------------------------------------------------------------

export interface AdminSystemHealthResponse {
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  timestamp: string;
  components: {
    api: { status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; latencyMs: number };
    database: { status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; latencyMs: number; poolConnections?: number };
    redis: { status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; latencyMs: number };
    outbox: { status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; pendingCount: number; deadLetterCount: number };
    webSocket: { status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; activeConnections: number };
  };
}

// ------------------------------------------------------------------------------
// 11. ANALYTICS
// ------------------------------------------------------------------------------

export interface AdminAnalyticsResponse {
  timeframe: string;
  users: {
    totalRegistered: number;
    newUsersPast30Days: number;
    workerRatio: number;
    employerRatio: number;
  };
  jobs: {
    totalPosted: number;
    publishedPast30Days: number;
    fillRatePercentage: number;
  };
  funnel: {
    totalApplications: number;
    shortlistedApplications: number;
    acceptedHires: number;
    applicationToHirePercentage: number;
    totalBookings: number;
    completedBookings: number;
    bookingCompletionPercentage: number;
  };
  payments: {
    totalVolumeInr: number;
    totalTransactions: number;
    averageTransactionValueInr: number;
    refundRatePercentage: number;
  };
  safety: {
    totalReports: number;
    totalDisputes: number;
    totalSuspensions: number;
    moderationResolutionRatePercentage: number;
  };
}

// ==============================================================================
// LocalSaathi — Product Analytics Platform Types (Phase 16)
// Canonical Taxonomy, Event Payloads, Query Filters, Explorer & KPI Aggregates
// ==============================================================================

export enum AnalyticsEventSource {
  SERVER_AUTHORITATIVE = 'SERVER_AUTHORITATIVE',
  CLIENT_INTERACTION = 'CLIENT_INTERACTION',
}

export enum AnalyticsPlatform {
  WEB = 'WEB',
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  BACKEND = 'BACKEND',
}

/**
 * Standard Canonical Event Taxonomy
 */
export enum AnalyticsEventName {
  // 1. Acquisition & Auth
  USER_SIGNUP_STARTED = 'user_signup_started',
  USER_SIGNUP_COMPLETED = 'user_signup_completed',
  USER_LOGIN_COMPLETED = 'user_login_completed',
  USER_LOGOUT = 'user_logout',

  // 2. Activation & Onboarding
  PROFILE_CREATION_STARTED = 'profile_creation_started',
  PROFILE_CREATION_COMPLETED = 'profile_creation_completed',
  IDENTITY_DOCUMENT_UPLOADED = 'identity_document_uploaded',
  VERIFICATION_REQUESTED = 'verification_requested',
  VERIFICATION_DECIDED = 'verification_decided',

  // 3. Job Lifecycle (Employer & Platform)
  JOB_DRAFT_CREATED = 'job_draft_created',
  JOB_POST_PUBLISHED = 'job_post_published',
  JOB_POST_EDITED = 'job_post_edited',
  JOB_POST_PAUSED = 'job_post_paused',
  JOB_POST_RESUMED = 'job_post_resumed',
  JOB_POST_CANCELLED = 'job_post_cancelled',
  JOB_POST_FILLED = 'job_post_filled',

  // 4. Discovery & Search (Client Interaction)
  JOB_SEARCH_PERFORMED = 'job_search_performed',
  JOB_FILTER_APPLIED = 'job_filter_applied',
  JOB_VIEWED = 'job_viewed',
  RECOMMENDATION_CLICKED = 'recommendation_clicked',
  VOICE_SEARCH_USED = 'voice_search_used',
  LANGUAGE_SWITCHED = 'language_switched',

  // 5. Worker Matching & Application
  MATCH_SCORED = 'match_scored',
  MATCH_NOTIFICATION_SENT = 'match_notification_sent',
  APPLICATION_SUBMITTED = 'application_submitted',
  APPLICATION_SHORTLISTED = 'application_shortlisted',
  APPLICATION_REJECTED = 'application_rejected',
  APPLICATION_ACCEPTED = 'application_accepted',
  APPLICATION_WITHDRAWN = 'application_withdrawn',

  // 6. Booking & Fulfillment
  BOOKING_OFFERED = 'booking_offered',
  BOOKING_ACCEPTED = 'booking_accepted',
  BOOKING_STARTED = 'booking_started',
  BOOKING_COMPLETED = 'booking_completed',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_DISPUTED = 'booking_disputed',

  // 7. Messaging & Communication
  CONVERSATION_INITIATED = 'conversation_initiated',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_READ = 'message_read',

  // 8. Financial & Payments
  PAYMENT_INTENT_CREATED = 'payment_intent_created',
  PAYMENT_CAPTURED = 'payment_captured',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_REQUESTED = 'refund_requested',
  REFUND_SETTLED = 'refund_settled',
  PAYOUT_DISBURSED = 'payout_disbursed',

  // 9. Trust, Safety & Quality
  REPORT_SUBMITTED = 'report_submitted',
  USER_BLOCKED = 'user_blocked',
  USER_SUSPENDED = 'user_suspended',
  RATING_SUBMITTED = 'rating_submitted',
}

/**
 * Client interaction event names permitted via public telemetry endpoint.
 * Server authoritative events cannot be posted via client telemetry.
 */
export const CLIENT_ALLOWED_EVENT_NAMES = new Set<string>([
  AnalyticsEventName.USER_SIGNUP_STARTED,
  AnalyticsEventName.USER_LOGOUT,
  AnalyticsEventName.PROFILE_CREATION_STARTED,
  AnalyticsEventName.JOB_SEARCH_PERFORMED,
  AnalyticsEventName.JOB_FILTER_APPLIED,
  AnalyticsEventName.JOB_VIEWED,
  AnalyticsEventName.RECOMMENDATION_CLICKED,
  AnalyticsEventName.VOICE_SEARCH_USED,
  AnalyticsEventName.LANGUAGE_SWITCHED,
  AnalyticsEventName.APPLICATION_WITHDRAWN,
]);

/**
 * Single Canonical Analytics Event Record (Stored in PostgreSQL)
 */
export interface AnalyticsEventRecord {
  id: string;
  eventId: string;
  eventName: string;
  occurredAt: string;
  ingestedAt: string;
  userId?: string | null;
  anonymousSessionId?: string | null;
  platform: string;
  appVersion: string;
  source: AnalyticsEventSource;
  correlationId?: string | null;
  schemaVersion: number;
  metadata: Record<string, unknown>;
}

/**
 * Payload sent by client telemetry client (Single or Batched)
 */
export interface ClientTrackEventInput {
  eventId: string;
  eventName: string;
  occurredAt?: string;
  anonymousSessionId?: string;
  platform?: AnalyticsPlatform | string;
  appVersion?: string;
  correlationId?: string;
  schemaVersion?: number;
  metadata?: Record<string, unknown>;
}

export interface ClientTrackBatchInput {
  events: ClientTrackEventInput[];
}

export interface AnalyticsIngestResponse {
  accepted: number;
  rejected: number;
  duplicates: number;
  errors?: Array<{ index: number; eventId?: string; reason: string }>;
}

/**
 * Filter & Pagination parameters for Admin Analytics Event Explorer
 */
export interface AdminAnalyticsEventQuery {
  page?: number;
  limit?: number;
  eventName?: string;
  source?: AnalyticsEventSource;
  platform?: string;
  userId?: string;
  anonymousSessionId?: string;
  correlationId?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdminAnalyticsEventListResponse {
  data: AnalyticsEventRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Product Analytics Aggregated Metrics Dashboard
 */
export interface ProductAnalyticsDashboardData {
  timeframe: string;
  generatedAt: string;

  // 1. Acquisition & Activation
  acquisition: {
    signupStartedCount: number;
    signupCompletedCount: number;
    signupConversionRate: number; // percentage
    loginCompletedCount: number;
    uniqueActiveUsers: number;
  };

  // 2. Engagement & Telemetry
  engagement: {
    totalInteractions: number;
    jobViewsCount: number;
    searchesCount: number;
    recommendationClicksCount: number;
    recommendationCtr: number; // percentage
    voiceSearchesCount: number;
    voiceUsagePercentage: number; // percentage of total searches
    topLanguages: Array<{ language: string; count: number }>;
  };

  // 3. Matching & Liquidity Funnel
  matching: {
    matchScoredCount: number;
    applicationsSubmittedCount: number;
    applicationsShortlistedCount: number;
    applicationsAcceptedCount: number;
    applicationConversionRate: number; // percentage
    medianTimeToFirstApplicationHours: number;
  };

  // 4. Employment & Fulfillment
  fulfillment: {
    bookingsOfferedCount: number;
    bookingsAcceptedCount: number;
    bookingsCompletedCount: number;
    bookingsDisputedCount: number;
    bookingCompletionRate: number; // percentage
  };

  // 5. Payment & Financial Health
  payments: {
    paymentIntentsCount: number;
    paymentCapturedCount: number;
    paymentFailedCount: number;
    paymentSuccessRate: number; // percentage
    totalCapturedVolumeInr: number;
    refundsSettledCount: number;
  };

  // 6. Trust & Safety Telemetry
  trustSafety: {
    reportsSubmittedCount: number;
    usersBlockedCount: number;
    usersSuspendedCount: number;
    ratingsSubmittedCount: number;
    averageRating: number;
  };
}

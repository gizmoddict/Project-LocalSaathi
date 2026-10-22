// ==============================================================================
// LocalSaathi — Product Analytics Platform Constants (Phase 16)
// Taxonomy Mapping, Privacy Blacklists, Limits & Retention Parameters
// ==============================================================================

import { DomainEventType, AnalyticsEventName } from '@localsaathi/types';

/**
 * Mapping of authoritative backend DomainEventType to Product Analytics Canonical Names
 */
export const DOMAIN_EVENT_TO_ANALYTICS_MAP: Partial<Record<DomainEventType, AnalyticsEventName>> = {
  [DomainEventType.APPLICATION_CREATED]: AnalyticsEventName.APPLICATION_SUBMITTED,
  [DomainEventType.APPLICATION_SHORTLISTED]: AnalyticsEventName.APPLICATION_SHORTLISTED,
  [DomainEventType.APPLICATION_REJECTED]: AnalyticsEventName.APPLICATION_REJECTED,
  [DomainEventType.APPLICATION_ACCEPTED]: AnalyticsEventName.APPLICATION_ACCEPTED,
  [DomainEventType.APPLICATION_WITHDRAWN]: AnalyticsEventName.APPLICATION_WITHDRAWN,
  [DomainEventType.BOOKING_CREATED]: AnalyticsEventName.BOOKING_OFFERED,
  [DomainEventType.BOOKING_CONFIRMED]: AnalyticsEventName.BOOKING_ACCEPTED,
  [DomainEventType.BOOKING_STARTED]: AnalyticsEventName.BOOKING_STARTED,
  [DomainEventType.BOOKING_COMPLETED]: AnalyticsEventName.BOOKING_COMPLETED,
  [DomainEventType.BOOKING_CANCELLED]: AnalyticsEventName.BOOKING_CANCELLED,
  [DomainEventType.JOB_PUBLISHED]: AnalyticsEventName.JOB_POST_PUBLISHED,
  [DomainEventType.JOB_PAUSED]: AnalyticsEventName.JOB_POST_PAUSED,
  [DomainEventType.JOB_RESUMED]: AnalyticsEventName.JOB_POST_RESUMED,
  [DomainEventType.JOB_FILLED]: AnalyticsEventName.JOB_POST_FILLED,
  [DomainEventType.JOB_CANCELLED]: AnalyticsEventName.JOB_POST_CANCELLED,
  [DomainEventType.CONVERSATION_CREATED]: AnalyticsEventName.CONVERSATION_INITIATED,
  [DomainEventType.MESSAGE_CREATED]: AnalyticsEventName.MESSAGE_SENT,
  [DomainEventType.MESSAGE_READ]: AnalyticsEventName.MESSAGE_READ,
  [DomainEventType.USER_BLOCKED]: AnalyticsEventName.USER_BLOCKED,
  [DomainEventType.VERIFICATION_SUBMITTED]: AnalyticsEventName.VERIFICATION_REQUESTED,
  [DomainEventType.VERIFICATION_APPROVED]: AnalyticsEventName.VERIFICATION_DECIDED,
  [DomainEventType.VERIFICATION_REJECTED]: AnalyticsEventName.VERIFICATION_DECIDED,
  [DomainEventType.USER_REPORTED]: AnalyticsEventName.REPORT_SUBMITTED,
  [DomainEventType.USER_SUSPENDED]: AnalyticsEventName.USER_SUSPENDED,
  [DomainEventType.DISPUTE_RAISED]: AnalyticsEventName.BOOKING_DISPUTED,
  [DomainEventType.PAYMENT_INITIATED]: AnalyticsEventName.PAYMENT_INTENT_CREATED,
  [DomainEventType.PAYMENT_CAPTURED]: AnalyticsEventName.PAYMENT_CAPTURED,
  [DomainEventType.PAYMENT_FAILED]: AnalyticsEventName.PAYMENT_FAILED,
  [DomainEventType.PAYMENT_REFUNDED]: AnalyticsEventName.REFUND_SETTLED,
  [DomainEventType.PAYOUT_INITIATED]: AnalyticsEventName.PAYOUT_DISBURSED,
};

/**
 * Privacy & Data Minimization: Prohibited sensitive metadata terms
 */
export const PROHIBITED_METADATA_PATTERNS = [
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'secret',
  'otp',
  'otphash',
  'card',
  'pan',
  'aadhaar',
  'cvv',
  'expiry',
  'rawdocument',
  'documenturl',
  'messagecontent',
  'messagebody',
  'phone',
  'email',
];

/**
 * Operating thresholds and retention windows
 */
export const ANALYTICS_CONFIG = {
  MAX_CLIENT_BATCH_SIZE: 100,
  DEFAULT_EXPLORER_PAGE_SIZE: 20,
  MAX_EXPLORER_PAGE_SIZE: 100,
  RETENTION_DAYS_RAW_EVENTS: 90,
  DEFAULT_SCHEMA_VERSION: 1,
};

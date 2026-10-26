export enum NotificationType {
  APPLICATION_RECEIVED = 'APPLICATION_RECEIVED',
  APPLICATION_SHORTLISTED = 'APPLICATION_SHORTLISTED',
  APPLICATION_REJECTED = 'APPLICATION_REJECTED',
  APPLICATION_ACCEPTED = 'APPLICATION_ACCEPTED',
  APPLICATION_WITHDRAWN = 'APPLICATION_WITHDRAWN',
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  BOOKING_STARTED = 'BOOKING_STARTED',
  BOOKING_COMPLETED = 'BOOKING_COMPLETED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  JOB_PUBLISHED = 'JOB_PUBLISHED',
  JOB_PAUSED = 'JOB_PAUSED',
  JOB_RESUMED = 'JOB_RESUMED',
  JOB_FILLED = 'JOB_FILLED',
  JOB_CANCELLED = 'JOB_CANCELLED',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  CONVERSATION_CREATED = 'CONVERSATION_CREATED',
  USER_BLOCKED = 'USER_BLOCKED',
  SYSTEM_NOTIFICATION = 'SYSTEM_NOTIFICATION',
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_REINSTATED = 'ACCOUNT_REINSTATED',
  USER_RESTRICTED = 'USER_RESTRICTED',
  DISPUTE_RAISED = 'DISPUTE_RAISED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  REPORT_FILED = 'REPORT_FILED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_CAPTURED = 'PAYMENT_CAPTURED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  REFUND_PROCESSED = 'REFUND_PROCESSED',
  PAYOUT_INITIATED = 'PAYOUT_INITIATED',
  PAYOUT_COMPLETED = 'PAYOUT_COMPLETED',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
}

export enum DomainEventType {
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_SHORTLISTED = 'APPLICATION_SHORTLISTED',
  APPLICATION_REJECTED = 'APPLICATION_REJECTED',
  APPLICATION_ACCEPTED = 'APPLICATION_ACCEPTED',
  APPLICATION_WITHDRAWN = 'APPLICATION_WITHDRAWN',
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  BOOKING_STARTED = 'BOOKING_STARTED',
  BOOKING_COMPLETED = 'BOOKING_COMPLETED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  JOB_PUBLISHED = 'JOB_PUBLISHED',
  JOB_PAUSED = 'JOB_PAUSED',
  JOB_RESUMED = 'JOB_RESUMED',
  JOB_FILLED = 'JOB_FILLED',
  JOB_CANCELLED = 'JOB_CANCELLED',
  CONVERSATION_CREATED = 'CONVERSATION_CREATED',
  MESSAGE_CREATED = 'MESSAGE_CREATED',
  MESSAGE_READ = 'MESSAGE_READ',
  MESSAGE_DELETED = 'MESSAGE_DELETED',
  USER_BLOCKED = 'USER_BLOCKED',
  VERIFICATION_SUBMITTED = 'VERIFICATION_SUBMITTED',
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',
  USER_REPORTED = 'USER_REPORTED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_REINSTATED = 'USER_REINSTATED',
  USER_RESTRICTED = 'USER_RESTRICTED',
  DISPUTE_RAISED = 'DISPUTE_RAISED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_AUTHORIZED = 'PAYMENT_AUTHORIZED',
  PAYMENT_CAPTURED = 'PAYMENT_CAPTURED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  PAYOUT_INITIATED = 'PAYOUT_INITIATED',
  PAYOUT_PROCESSED = 'PAYOUT_PROCESSED',
  PAYOUT_FAILED = 'PAYOUT_FAILED',
}

export enum DomainEventStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  entityType: string | null;
  entityId: string | null;
  payload?: Record<string, unknown> | null;
  sourceEventId?: string | null;
  deliveryStatus?: string;
  isRead: boolean;
  readAt: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
  cursor?: string;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface NotificationPreferenceResponse {
  id: string;
  userId: string;
  applicationUpdates: boolean;
  bookingUpdates: boolean;
  jobUpdates: boolean;
  messageUpdates: boolean;
  systemUpdates: boolean;
}

export interface UpdateNotificationPreferenceInput {
  applicationUpdates?: boolean;
  bookingUpdates?: boolean;
  jobUpdates?: boolean;
  messageUpdates?: boolean;
  systemUpdates?: boolean;
}

export interface MarkReadResponse {
  id: string;
  isRead: boolean;
  readAt: string;
}

export interface MarkAllReadResponse {
  markedCount: number;
}

export interface DomainEventPayload {
  jobTitle?: string;
  jobId?: string;
  applicationId?: string;
  bookingId?: string;
  workerId?: string;
  employerId?: string;
  startDate?: string;
  [key: string]: unknown;
}

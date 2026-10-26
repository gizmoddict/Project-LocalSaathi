import { DomainEventType, NotificationItem } from './notification.types';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

export enum NotificationDeliveryStatus {
  CREATED = 'CREATED',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
}

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: DomainEventType | string;
  eventVersion: number;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string;
  payload: T;
  metadata?: {
    requestId?: string;
    correlationId?: string;
    traceId?: string;
    [key: string]: unknown;
  };
}

export interface OutboxEventItem {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | null;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  status: OutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  processedAt?: string | null;
  failedAt?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxListResponse {
  events: OutboxEventItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AdminEventStatsResponse {
  pendingCount: number;
  processingCount: number;
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
}

export type OutboxMetricsResponse = AdminEventStatsResponse;
export type OutboxEventListResponse = OutboxListResponse;

export interface DeadLetterActionResponse {
  success: boolean;
  message: string;
  eventId: string;
}

export interface WebSocketNotificationEvent {
  event: 'notification.created' | 'notification.read' | 'notification.count_updated';
  notification?: NotificationItem;
  unreadCount?: number;
  notificationId?: string;
  timestamp: string;
}


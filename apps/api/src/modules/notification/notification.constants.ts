import { DomainEventType, NotificationPriority, NotificationType } from '@localsaathi/types';

// Maps DomainEventType → which NotificationType to emit for which recipient category
export interface NotificationTemplate {
  type: NotificationType;
  priority: NotificationPriority;
  entityType: string;
  // 'worker' = send to worker, 'employer' = send to employer, 'actor' = send to event actor
  recipient: 'worker' | 'employer';
  title: (payload: Record<string, unknown>) => string;
  body: (payload: Record<string, unknown>) => string;
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

export const NOTIFICATION_TEMPLATES: Partial<
  Record<DomainEventType, NotificationTemplate[]>
> = {
  [DomainEventType.APPLICATION_CREATED]: [
    {
      type: NotificationType.APPLICATION_RECEIVED,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobApplication',
      recipient: 'employer',
      title: () => 'New job application',
      body: (p) => `A worker has applied for "${s(p['jobTitle'])}".`,
    },
  ],
  [DomainEventType.APPLICATION_SHORTLISTED]: [
    {
      type: NotificationType.APPLICATION_SHORTLISTED,
      priority: NotificationPriority.HIGH,
      entityType: 'JobApplication',
      recipient: 'worker',
      title: () => 'Application shortlisted',
      body: (p) =>
        `Your application for "${s(p['jobTitle'])}" has been shortlisted.`,
    },
  ],
  [DomainEventType.APPLICATION_REJECTED]: [
    {
      type: NotificationType.APPLICATION_REJECTED,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobApplication',
      recipient: 'worker',
      title: () => 'Application update',
      body: (p) =>
        `Your application for "${s(p['jobTitle'])}" was not selected.`,
    },
  ],
  [DomainEventType.APPLICATION_ACCEPTED]: [
    {
      type: NotificationType.APPLICATION_ACCEPTED,
      priority: NotificationPriority.HIGH,
      entityType: 'JobApplication',
      recipient: 'worker',
      title: () => 'Application accepted',
      body: (p) =>
        `Your application for "${s(p['jobTitle'])}" has been accepted. You will receive a contract offer soon.`,
    },
  ],
  [DomainEventType.APPLICATION_WITHDRAWN]: [
    {
      type: NotificationType.APPLICATION_WITHDRAWN,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobApplication',
      recipient: 'employer',
      title: () => 'Application withdrawn',
      body: (p) =>
        `A worker has withdrawn their application for "${s(p['jobTitle'])}".`,
    },
  ],
  [DomainEventType.BOOKING_CREATED]: [
    {
      type: NotificationType.BOOKING_CREATED,
      priority: NotificationPriority.HIGH,
      entityType: 'Booking',
      recipient: 'worker',
      title: () => 'New contract offer',
      body: (p) =>
        `You have received a contract offer for "${s(p['jobTitle'])}" starting ${s(p['startDate'])}.`,
    },
  ],
  [DomainEventType.BOOKING_CONFIRMED]: [
    {
      type: NotificationType.BOOKING_CONFIRMED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Booking',
      recipient: 'employer',
      title: () => 'Contract confirmed by worker',
      body: (p) =>
        `The worker has confirmed the contract for "${s(p['jobTitle'])}".`,
    },
    {
      type: NotificationType.BOOKING_CONFIRMED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Booking',
      recipient: 'worker',
      title: () => 'Booking confirmed',
      body: (p) => `The booking for "${s(p['jobTitle'])}" has been confirmed.`,
    },
  ],
  [DomainEventType.BOOKING_STARTED]: [
    {
      type: NotificationType.BOOKING_STARTED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Booking',
      recipient: 'worker',
      title: () => 'Work started',
      body: (p) =>
        `Your engagement for "${s(p['jobTitle'])}" has started.`,
    },
  ],
  [DomainEventType.BOOKING_COMPLETED]: [
    {
      type: NotificationType.BOOKING_COMPLETED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Booking',
      recipient: 'worker',
      title: () => 'Work completed',
      body: (p) =>
        `Your engagement for "${s(p['jobTitle'])}" has been marked completed.`,
    },
    {
      type: NotificationType.BOOKING_COMPLETED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Booking',
      recipient: 'employer',
      title: () => 'Work completed',
      body: (p) =>
        `The engagement for "${s(p['jobTitle'])}" has been marked completed.`,
    },
  ],
  [DomainEventType.BOOKING_CANCELLED]: [
    {
      type: NotificationType.BOOKING_CANCELLED,
      priority: NotificationPriority.HIGH,
      entityType: 'Booking',
      recipient: 'worker',
      title: () => 'Booking cancelled',
      body: (p) =>
        `The booking for "${s(p['jobTitle'])}" has been cancelled.`,
    },
    {
      type: NotificationType.BOOKING_CANCELLED,
      priority: NotificationPriority.HIGH,
      entityType: 'Booking',
      recipient: 'employer',
      title: () => 'Booking cancelled',
      body: (p) =>
        `The booking for "${s(p['jobTitle'])}" has been cancelled.`,
    },
  ],
  [DomainEventType.JOB_PUBLISHED]: [
    {
      type: NotificationType.JOB_PUBLISHED,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobPost',
      recipient: 'employer',
      title: () => 'Job published',
      body: (p) => `Your job "${s(p['title'] || p['jobTitle'])}" is now published and active.`,
    },
  ],
  [DomainEventType.JOB_PAUSED]: [
    {
      type: NotificationType.JOB_PAUSED,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobPost',
      recipient: 'employer',
      title: () => 'Job paused',
      body: (p) => `Your job "${s(p['title'] || p['jobTitle'])}" has been paused.`,
    },
  ],
  [DomainEventType.JOB_RESUMED]: [
    {
      type: NotificationType.JOB_RESUMED,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobPost',
      recipient: 'employer',
      title: () => 'Job resumed',
      body: (p) => `Your job "${s(p['title'] || p['jobTitle'])}" has been resumed.`,
    },
  ],
  [DomainEventType.JOB_FILLED]: [
    {
      type: NotificationType.JOB_FILLED,
      priority: NotificationPriority.NORMAL,
      entityType: 'JobPost',
      recipient: 'employer',
      title: () => 'Job marked as filled',
      body: (p) => `Your job "${s(p['title'] || p['jobTitle'])}" has been filled.`,
    },
  ],
  [DomainEventType.JOB_CANCELLED]: [
    {
      type: NotificationType.JOB_CANCELLED,
      priority: NotificationPriority.HIGH,
      entityType: 'JobPost',
      recipient: 'employer',
      title: () => 'Job cancelled',
      body: (p) => `Your job "${s(p['title'] || p['jobTitle'])}" has been cancelled.`,
    },
  ],
  [DomainEventType.MESSAGE_CREATED]: [
    {
      type: NotificationType.MESSAGE_RECEIVED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Message',
      recipient: 'recipient' as any,
      title: (p) => `New message from ${s(p['senderName'] || 'User')}`,
      body: (p) => s(p['preview'] || 'You received a new message.'),
    },
  ],
  [DomainEventType.CONVERSATION_CREATED]: [
    {
      type: NotificationType.CONVERSATION_CREATED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Conversation',
      recipient: 'recipient' as any,
      title: () => 'New conversation started',
      body: (p) => s(p['description'] || 'A new conversation has been opened.'),
    },
  ],
  [DomainEventType.USER_BLOCKED]: [
    {
      type: NotificationType.USER_BLOCKED,
      priority: NotificationPriority.HIGH,
      entityType: 'User',
      recipient: 'recipient' as any,
      title: () => 'Account security notice',
      body: (p) => s(p['reason'] || 'A security or block action was recorded on your account.'),
    },
  ],
  [DomainEventType.VERIFICATION_APPROVED]: [
    {
      type: NotificationType.VERIFICATION_APPROVED,
      priority: NotificationPriority.HIGH,
      entityType: 'User',
      recipient: 'recipient' as any,
      title: () => 'Verification approved',
      body: () => 'Congratulations! Your identity verification has been approved.',
    },
  ],
  [DomainEventType.VERIFICATION_REJECTED]: [
    {
      type: NotificationType.VERIFICATION_REJECTED,
      priority: NotificationPriority.HIGH,
      entityType: 'User',
      recipient: 'recipient' as any,
      title: () => 'Verification update',
      body: (p) =>
        `Your verification could not be approved: ${s(p['reason'] || 'Document requirements not met.')}`,
    },
  ],
  [DomainEventType.USER_SUSPENDED]: [
    {
      type: NotificationType.ACCOUNT_SUSPENDED,
      priority: NotificationPriority.HIGH,
      entityType: 'User',
      recipient: 'recipient' as any,
      title: () => 'Account suspension notice',
      body: (p) =>
        `Your account has been suspended: ${s(p['reason'] || 'Violation of platform terms.')}`,
    },
  ],
  [DomainEventType.USER_REINSTATED]: [
    {
      type: NotificationType.ACCOUNT_REINSTATED,
      priority: NotificationPriority.NORMAL,
      entityType: 'User',
      recipient: 'recipient' as any,
      title: () => 'Account reinstated',
      body: () =>
        'Your account suspension has been lifted. You may now resume using LocalSaathi.',
    },
  ],
  [DomainEventType.USER_RESTRICTED]: [
    {
      type: NotificationType.USER_RESTRICTED,
      priority: NotificationPriority.HIGH,
      entityType: 'User',
      recipient: 'recipient' as any,
      title: () => 'Account restriction notice',
      body: (p) =>
        `A restriction has been placed on your account (${s(p['restrictionType'])}): ${s(p['reason'] || 'Policy violation.')}`,
    },
  ],
  [DomainEventType.DISPUTE_RAISED]: [
    {
      type: NotificationType.DISPUTE_RAISED,
      priority: NotificationPriority.HIGH,
      entityType: 'Dispute',
      recipient: 'recipient' as any,
      title: () => 'Dispute raised on booking',
      body: (p) =>
        `A dispute has been raised regarding your booking: ${s(p['reason'] || 'Service issue reported.')}`,
    },
  ],
  [DomainEventType.DISPUTE_RESOLVED]: [
    {
      type: NotificationType.DISPUTE_RESOLVED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Dispute',
      recipient: 'recipient' as any,
      title: () => 'Dispute resolved',
      body: (p) =>
        `The dispute has been resolved: ${s(p['resolution'] || 'Case closed.')}`,
    },
  ],
  [DomainEventType.PAYMENT_INITIATED]: [
    {
      type: NotificationType.PAYMENT_INITIATED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Payment',
      recipient: 'payer' as any,
      title: () => 'Payment initiated',
      body: (p: Record<string, unknown>) =>
        `A payment of INR ${s(p['amount'])} has been initiated for booking.`,
    },
  ],
  [DomainEventType.PAYMENT_CAPTURED]: [
    {
      type: NotificationType.PAYMENT_CAPTURED,
      priority: NotificationPriority.HIGH,
      entityType: 'Payment',
      recipient: 'payer' as any,
      title: () => 'Payment successful',
      body: (p: Record<string, unknown>) =>
        `Your payment of INR ${s(p['amount'])} was successfully captured.`,
    },
    {
      type: NotificationType.PAYMENT_CAPTURED,
      priority: NotificationPriority.HIGH,
      entityType: 'Payment',
      recipient: 'payee' as any,
      title: () => 'Payment secured',
      body: (p: Record<string, unknown>) =>
        `Payment of INR ${s(p['amount'])} for your booking has been secured.`,
    },
  ],
  [DomainEventType.PAYMENT_FAILED]: [
    {
      type: NotificationType.PAYMENT_FAILED,
      priority: NotificationPriority.HIGH,
      entityType: 'Payment',
      recipient: 'payer' as any,
      title: () => 'Payment failed',
      body: (p: Record<string, unknown>) =>
        `Payment of INR ${s(p['amount'])} failed: ${s(p['reason'] || 'Transaction declined.')}`,
    },
  ],
  [DomainEventType.PAYMENT_REFUNDED]: [
    {
      type: NotificationType.REFUND_PROCESSED,
      priority: NotificationPriority.HIGH,
      entityType: 'Payment',
      recipient: 'payer' as any,
      title: () => 'Refund processed',
      body: (p: Record<string, unknown>) =>
        `A refund of INR ${s(p['amount'])} has been processed to your payment method.`,
    },
  ],
  [DomainEventType.PAYOUT_INITIATED]: [
    {
      type: NotificationType.PAYOUT_INITIATED,
      priority: NotificationPriority.NORMAL,
      entityType: 'Payout',
      recipient: 'worker' as any,
      title: () => 'Payout initiated',
      body: (p: Record<string, unknown>) =>
        `A payout transfer of INR ${s(p['amount'])} has been initiated.`,
    },
  ],
  [DomainEventType.PAYOUT_PROCESSED]: [
    {
      type: NotificationType.PAYOUT_COMPLETED,
      priority: NotificationPriority.HIGH,
      entityType: 'Payout',
      recipient: 'worker' as any,
      title: () => 'Payout completed',
      body: (p: Record<string, unknown>) =>
        `Payout of INR ${s(p['amount'])} has been deposited into your account.`,
    },
  ],
};

export const NOTIFICATION_ERROR_CODES = {
  NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
  FORBIDDEN: 'NOTIFICATION_FORBIDDEN',
  ALREADY_READ: 'NOTIFICATION_ALREADY_READ',
  INVALID_CURSOR: 'NOTIFICATION_INVALID_CURSOR',
} as const;

// ==============================================================================
// LocalSaathi — Payment, Refund & Payout Domain Types (Phase 14)
// ==============================================================================

export type PaymentStatus =
  | 'INITIATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'DISPUTED';

export type PaymentAttemptStatus =
  | 'INITIATED'
  | 'PENDING_USER_ACTION'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED';

export type PaymentEventType =
  | 'ORDER_CREATED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'REFUND_PROCESSED'
  | 'DISPUTE_CREATED'
  | 'PAYOUT_INITIATED'
  | 'PAYOUT_PROCESSED'
  | 'PAYOUT_FAILED';

export type RefundStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED';

export type PayoutStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export type PaymentProviderName = 'RAZORPAY' | 'MOCK' | 'STRIPE_FUTURE';

export interface PaymentAttemptResponse {
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: PaymentAttemptStatus;
  providerReference?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  failureReason?: string | null;
  createdAt: string;
}

export interface RefundResponse {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason?: string | null;
  status: RefundStatus;
  providerRefundId?: string | null;
  idempotencyKey: string;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutResponse {
  id: string;
  bookingId?: string | null;
  workerId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  provider: string;
  providerPayoutId?: string | null;
  idempotencyKey: string;
  failureReason?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentResponse {
  id: string;
  payerId: string;
  payeeId?: string | null;
  bookingId?: string | null;
  provider: string;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
  failureCode?: string | null;
  failureReason?: string | null;
  capturedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attempts?: PaymentAttemptResponse[];
  refunds?: RefundResponse[];
}

export interface PaymentEventResponse {
  id: string;
  paymentId?: string | null;
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  isProcessed: boolean;
  processedAt?: string | null;
  receivedAt: string;
}

export interface InitiatePaymentDto {
  bookingId: string;
  amount: number;
  currency?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CreateRefundDto {
  amount: number;
  reason?: string;
  idempotencyKey: string;
}

export interface CreatePayoutDto {
  bookingId?: string;
  workerId: string;
  amount: number;
  currency?: string;
  idempotencyKey: string;
}

export interface ReconciliationDiscrepancy {
  type: 'PAYMENT' | 'REFUND' | 'PAYOUT';
  id: string;
  issue: string;
  dbStatus: string;
  providerStatus?: string | null;
  detectedAt: string;
}

export interface ReconciliationReport {
  timestamp: string;
  totalChecked: number;
  matched: number;
  discrepancies: ReconciliationDiscrepancy[];
}

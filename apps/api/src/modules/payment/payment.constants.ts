// ==============================================================================
// LocalSaathi — Payment Constants & Error Codes (Phase 14)
// ==============================================================================

export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER_TOKEN';

export const PAYMENT_ERROR_CODES = {
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  INVALID_PAYMENT_STATE: 'INVALID_PAYMENT_STATE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  UNAUTHORIZED_BOOKING_STATUS: 'UNAUTHORIZED_BOOKING_STATUS',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  DUPLICATE_WEBHOOK_EVENT: 'DUPLICATE_WEBHOOK_EVENT',
  REFUND_EXCEEDS_CAPTURED_AMOUNT: 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
  REFUND_NOT_ALLOWED: 'REFUND_NOT_ALLOWED',
  PAYOUT_NOT_ALLOWED: 'PAYOUT_NOT_ALLOWED',
} as const;

export const PAYMENT_NOTIFICATION_TEMPLATES = {
  PAYMENT_INITIATED: {
    title: 'Payment Initiated',
    body: (amount: number, currency: string) =>
      `A payment of ${currency} ${amount} has been initiated for your booking.`,
  },
  PAYMENT_CAPTURED: {
    title: 'Payment Successful',
    body: (amount: number, currency: string) =>
      `Your payment of ${currency} ${amount} has been successfully completed and secured.`,
  },
  PAYMENT_FAILED: {
    title: 'Payment Failed',
    body: (amount: number, currency: string, reason?: string) =>
      `Payment of ${currency} ${amount} failed.${reason ? ` Reason: ${reason}` : ''}`,
  },
  REFUND_PROCESSED: {
    title: 'Refund Processed',
    body: (amount: number, currency: string) =>
      `A refund of ${currency} ${amount} has been processed back to your original payment method.`,
  },
  PAYOUT_INITIATED: {
    title: 'Payout Initiated',
    body: (amount: number, currency: string) =>
      `A payout transfer of ${currency} ${amount} has been initiated to your bank account.`,
  },
  PAYOUT_COMPLETED: {
    title: 'Payout Completed',
    body: (amount: number, currency: string) =>
      `Payout of ${currency} ${amount} has been successfully deposited into your account.`,
  },
};

// ==============================================================================
// LocalSaathi — Payment Provider Interface (Phase 14)
// ==============================================================================

export interface CreateOrderParams {
  amount: number; // In minor units (paise for INR) or major, let's specify major number
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface ProviderOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  rawResponse?: Record<string, unknown>;
}

export interface ProviderPaymentResult {
  paymentId: string;
  orderId?: string | null;
  amount: number;
  currency: string;
  status: 'authorized' | 'captured' | 'failed' | 'refunded';
  method?: string;
  errorCode?: string | null;
  errorDescription?: string | null;
  rawResponse?: Record<string, unknown>;
}

export interface CapturePaymentParams {
  paymentId: string;
  amount: number;
  currency: string;
}

export interface ProviderCaptureResult {
  paymentId: string;
  status: 'captured';
  amount: number;
  currency: string;
  rawResponse?: Record<string, unknown>;
}

export interface ProcessRefundParams {
  paymentId: string;
  amount: number;
  notes?: Record<string, string>;
}

export interface ProviderRefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  status: 'processed' | 'pending' | 'failed';
  rawResponse?: Record<string, unknown>;
}

export interface CreatePayoutParams {
  workerId: string;
  amount: number;
  currency: string;
  accountReference?: string;
  notes?: Record<string, string>;
}

export interface ProviderPayoutResult {
  payoutId: string;
  amount: number;
  currency: string;
  status: 'processed' | 'pending' | 'failed';
  rawResponse?: Record<string, unknown>;
}

export interface ProviderWebhookEvent {
  eventId: string;
  eventType: string; // e.g., 'payment.captured', 'payment.failed', 'refund.processed'
  providerPaymentId?: string;
  providerOrderId?: string;
  providerRefundId?: string;
  amount?: number;
  currency?: string;
  errorDescription?: string;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly providerName: string;

  createOrder(params: CreateOrderParams): Promise<ProviderOrderResult>;

  fetchPayment(paymentId: string): Promise<ProviderPaymentResult>;

  capturePayment(params: CapturePaymentParams): Promise<ProviderCaptureResult>;

  processRefund(params: ProcessRefundParams): Promise<ProviderRefundResult>;

  createPayout(params: CreatePayoutParams): Promise<ProviderPayoutResult>;

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secret?: string,
  ): boolean;

  parseWebhookEvent(body: Record<string, unknown>): ProviderWebhookEvent;
}

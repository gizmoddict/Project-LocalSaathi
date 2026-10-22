import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  bookingId: z.string().uuid({ message: 'Valid booking ID is required' }),
  amount: z.number().positive({ message: 'Amount must be greater than zero' }),
  currency: z.string().min(3).max(10).default('INR').optional(),
  idempotencyKey: z.string().min(8, { message: 'Idempotency key must be at least 8 characters' }).max(100),
  metadata: z.record(z.unknown()).optional(),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const createRefundSchema = z.object({
  amount: z.number().positive({ message: 'Refund amount must be greater than zero' }),
  reason: z.string().max(255).optional(),
  idempotencyKey: z.string().min(8, { message: 'Idempotency key must be at least 8 characters' }).max(100),
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export const createPayoutSchema = z.object({
  bookingId: z.string().uuid().optional(),
  workerId: z.string().uuid({ message: 'Valid worker user ID is required' }),
  amount: z.number().positive({ message: 'Payout amount must be greater than zero' }),
  currency: z.string().min(3).max(10).default('INR').optional(),
  idempotencyKey: z.string().min(8, { message: 'Idempotency key must be at least 8 characters' }).max(100),
});

export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;

export const paymentWebhookSchema = z.object({
  event: z.string().min(1, { message: 'Webhook event is required' }),
  payload: z.record(z.unknown()),
});

export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;

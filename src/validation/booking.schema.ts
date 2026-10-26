import { z } from 'zod';

export const createBookingSchema = z.object({
  agreedWage: z
    .number()
    .positive('Agreed wage must be greater than zero')
    .max(1_000_000, 'Agreed wage exceeds allowed maximum')
    .optional(),
  wageType: z.enum(['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE']).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
    .optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:MM')
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:MM')
    .optional(),
  durationDays: z
    .number()
    .int()
    .min(1, 'Duration must be at least 1 day')
    .max(365, 'Duration cannot exceed 365 days')
    .optional(),
  workLocationAddress: z.string().max(255).optional(),
  workLocationLocality: z.string().max(100).optional(),
  workLocationCity: z.string().max(100).optional(),
  workLocationState: z.string().max(100).optional(),
  workLocationPinCode: z
    .string()
    .regex(/^\d{6}$/, 'Pin code must be 6 digits')
    .optional(),
});

export type CreateBookingInputSchema = z.input<typeof createBookingSchema>;
export type CreateBookingOutputSchema = z.output<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Cancellation reason must be at least 3 characters')
    .max(500, 'Cancellation reason must not exceed 500 characters'),
});

export type CancelBookingInputSchema = z.input<typeof cancelBookingSchema>;
export type CancelBookingOutputSchema = z.output<typeof cancelBookingSchema>;

export const bookingQuerySchema = z.object({
  status: z
    .enum(['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at_desc', 'start_date_asc']).default('created_at_desc'),
});

export type BookingQueryInputSchema = z.input<typeof bookingQuerySchema>;
export type BookingQueryOutputSchema = z.output<typeof bookingQuerySchema>;

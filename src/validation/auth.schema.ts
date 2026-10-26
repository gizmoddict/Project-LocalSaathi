import { z } from 'zod';
import { phoneNumberSchema } from './common.schema';

/**
 * Permitted self-registration roles.
 * CRITICAL SECURITY: Never allow clients to self-register as ADMIN, MODERATOR, or SUPPORT.
 */
export const registerableRoleSchema = z.enum(['WORKER', 'EMPLOYER'], {
  errorMap: () => ({ message: 'Self-registration is only allowed for WORKER or EMPLOYER roles' }),
});

/**
 * OTP Request Payload Schema.
 */
export const requestOtpSchema = z.object({
  phone: phoneNumberSchema,
  role: registerableRoleSchema.default('WORKER'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

/**
 * OTP Verification Payload Schema.
 */
export const verifyOtpSchema = z.object({
  phone: phoneNumberSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits' }),
  role: registerableRoleSchema.default('WORKER'),
  deviceInfo: z.string().trim().max(255).optional(),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * Refresh Token Payload Schema (used if transport is in JSON body fallback).
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(20, { message: 'Refresh token must be valid' }).optional(),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

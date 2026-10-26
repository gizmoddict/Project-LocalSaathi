import { z } from 'zod';
import { uuidSchema, pinCodeSchema } from './common.schema';

/**
 * Update worker basic profile schema.
 * Client cannot supply: userId, role, verificationStatus, createdAt, updatedAt.
 */
export const updateWorkerProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { message: 'Display name must be at least 2 characters' })
    .max(100, { message: 'Display name cannot exceed 100 characters' })
    .optional(),
  bio: z
    .string()
    .trim()
    .max(1000, { message: 'Bio cannot exceed 1000 characters' })
    .nullable()
    .optional(),
  experienceYears: z
    .number()
    .int({ message: 'Experience years must be an integer' })
    .min(0, { message: 'Experience years cannot be negative' })
    .max(60, { message: 'Experience years cannot exceed 60' })
    .optional(),
  expectedWage: z
    .number()
    .min(0, { message: 'Expected wage cannot be negative' })
    .max(1000000, { message: 'Expected wage exceeds allowable maximum' })
    .nullable()
    .optional(),
  wageType: z
    .enum(['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE'], {
      message: 'Invalid wage type',
    })
    .optional(),
  preferredRadiusKm: z
    .number()
    .int()
    .min(1, { message: 'Radius must be at least 1 km' })
    .max(100, { message: 'Radius cannot exceed 100 km' })
    .optional(),
  languages: z
    .array(
      z.string().trim().min(2).max(10).toLowerCase()
    )
    .min(1, { message: 'At least one language must be specified' })
    .max(10, { message: 'Cannot exceed 10 languages' })
    .optional(),
  isAvailable: z.boolean().optional(),
});

/**
 * Add skill to worker profile schema.
 */
export const addWorkerSkillSchema = z
  .object({
    skillId: uuidSchema.optional(),
    name: z
      .string()
      .trim()
      .min(2, { message: 'Skill name must be at least 2 characters' })
      .max(100, { message: 'Skill name cannot exceed 100 characters' })
      .optional(),
    proficiency: z
      .enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT'])
      .default('INTERMEDIATE'),
    experienceYears: z
      .number()
      .int()
      .min(0, { message: 'Skill experience cannot be negative' })
      .max(60, { message: 'Skill experience cannot exceed 60' })
      .default(1),
  })
  .refine(
    (data) => Boolean(data.skillId || data.name),
    { message: 'Either skillId or skill name must be provided' }
  );

/**
 * Update worker skill proficiency/experience schema.
 */
export const updateWorkerSkillSchema = z.object({
  proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT']).optional(),
  experienceYears: z
    .number()
    .int()
    .min(0, { message: 'Skill experience cannot be negative' })
    .max(60, { message: 'Skill experience cannot exceed 60' })
    .optional(),
});

/**
 * Update worker location schema with PostGIS point support.
 */
export const updateWorkerLocationSchema = z.object({
  latitude: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90' })
    .max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180' })
    .max(180, { message: 'Longitude must be between -180 and 180' }),
  accuracyMeters: z.number().min(0).nullable().optional(),
  addressLine: z.string().trim().max(255).nullable().optional(),
  locality: z.string().trim().min(1).max(100).nullable().optional(),
  city: z.string().trim().min(1).max(100).nullable().optional(),
  state: z.string().trim().min(1).max(100).nullable().optional(),
  pinCode: pinCodeSchema.nullable().optional(),
  preferredRadiusKm: z
    .number()
    .int()
    .min(1, { message: 'Radius must be at least 1 km' })
    .max(100, { message: 'Radius cannot exceed 100 km' })
    .optional(),
});

/**
 * Create worker availability schedule slot schema.
 */
export const createWorkerAvailabilitySchema = z
  .object({
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be formatted as YYYY-MM-DD' }),
    startTime: z
      .string()
      .trim()
      .regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: 'Start time must be formatted as HH:mm (24-hour)',
      })
      .nullable()
      .optional(),
    endTime: z
      .string()
      .trim()
      .regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: 'End time must be formatted as HH:mm (24-hour)',
      })
      .nullable()
      .optional(),
    status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'BOOKED']).default('AVAILABLE'),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
      }
      return true;
    },
    { message: 'Start time must be chronologically earlier than end time' }
  );

/**
 * Update worker availability schedule slot schema.
 */
export const updateWorkerAvailabilitySchema = z
  .object({
    startTime: z
      .string()
      .trim()
      .regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: 'Start time must be formatted as HH:mm (24-hour)',
      })
      .nullable()
      .optional(),
    endTime: z
      .string()
      .trim()
      .regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: 'End time must be formatted as HH:mm (24-hour)',
      })
      .nullable()
      .optional(),
    status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'BOOKED']).optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
      }
      return true;
    },
    { message: 'Start time must be chronologically earlier than end time' }
  );

export type UpdateWorkerProfileInput = z.infer<typeof updateWorkerProfileSchema>;
export type AddWorkerSkillInput = z.infer<typeof addWorkerSkillSchema>;
export type UpdateWorkerSkillInput = z.infer<typeof updateWorkerSkillSchema>;
export type UpdateWorkerLocationInput = z.infer<typeof updateWorkerLocationSchema>;
export type CreateWorkerAvailabilityInput = z.infer<typeof createWorkerAvailabilitySchema>;
export type UpdateWorkerAvailabilityInput = z.infer<typeof updateWorkerAvailabilitySchema>;

import { z } from 'zod';
import { uuidSchema, pinCodeSchema } from './common.schema';

/**
 * Skill requirement for a job post.
 */
export const jobSkillInputSchema = z.object({
  skillId: uuidSchema.optional(),
  name: z.string().trim().min(2).max(100).optional(),
  isRequired: z.boolean().default(true),
  minExperienceYears: z.number().int().min(0).max(40).default(0),
}).refine((data) => data.skillId || data.name, {
  message: 'Either skillId or skill name must be provided',
});

/**
 * Spatial and address location for a job post.
 */
export const jobLocationInputSchema = z.object({
  latitude: z.number().min(-90).max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z.number().min(-180).max(180, { message: 'Longitude must be between -180 and 180' }),
  addressLine: z.string().trim().max(255).nullable().optional(),
  locality: z.string().trim().min(2, { message: 'Locality is required' }).max(100),
  city: z.string().trim().min(2, { message: 'City is required' }).max(100),
  state: z.string().trim().min(2, { message: 'State is required' }).max(100),
  pinCode: pinCodeSchema,
});

/**
 * Job creation schema.
 */
export const createJobSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: 'Job title must be at least 3 characters' })
    .max(200, { message: 'Job title cannot exceed 200 characters' }),
  description: z
    .string()
    .trim()
    .min(10, { message: 'Job description must be at least 10 characters' })
    .max(5000, { message: 'Job description cannot exceed 5000 characters' }),
  category: z
    .string()
    .trim()
    .min(2, { message: 'Category is required' })
    .max(50),
  wageType: z.enum(['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE'], {
    message: 'Invalid wage type',
  }),
  wageAmount: z
    .number()
    .min(1, { message: 'Wage amount must be greater than 0' })
    .max(1000000, { message: 'Wage amount exceeds allowable limit' }),
  workerCount: z
    .number()
    .int()
    .min(1, { message: 'Worker count must be at least 1' })
    .max(100, { message: 'Worker count cannot exceed 100' })
    .default(1),
  durationDays: z
    .number()
    .int()
    .min(1, { message: 'Duration must be at least 1 day' })
    .max(365, { message: 'Duration cannot exceed 365 days' })
    .default(1),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must be in YYYY-MM-DD format' }),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Start time must be in HH:mm format' })
    .optional(),
  urgency: z.enum(['IMMEDIATE', 'STANDARD', 'FLEXIBLE']).default('STANDARD'),
  requirements: z.array(z.string().trim().min(1)).optional().default([]),
  languageRequirements: z.array(z.string().trim().min(1)).optional().default([]),
  skills: z.array(jobSkillInputSchema).optional(),
  location: jobLocationInputSchema.optional(),
});

/**
 * Job update schema (for editing draft or active jobs).
 * Strictly forbids client manipulation of status, employerProfileId, publishedAt, id.
 */
export const updateJobSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: 'Job title must be at least 3 characters' })
    .max(200, { message: 'Job title cannot exceed 200 characters' })
    .optional(),
  description: z
    .string()
    .trim()
    .min(10, { message: 'Job description must be at least 10 characters' })
    .max(5000, { message: 'Job description cannot exceed 5000 characters' })
    .optional(),
  category: z
    .string()
    .trim()
    .min(2, { message: 'Category is required' })
    .max(50)
    .optional(),
  wageType: z.enum(['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE']).optional(),
  wageAmount: z
    .number()
    .min(1, { message: 'Wage amount must be greater than 0' })
    .max(1000000, { message: 'Wage amount exceeds allowable limit' })
    .optional(),
  workerCount: z
    .number()
    .int()
    .min(1, { message: 'Worker count must be at least 1' })
    .max(100, { message: 'Worker count cannot exceed 100' })
    .optional(),
  durationDays: z
    .number()
    .int()
    .min(1, { message: 'Duration must be at least 1 day' })
    .max(365, { message: 'Duration cannot exceed 365 days' })
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must be in YYYY-MM-DD format' })
    .optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Start time must be in HH:mm format' })
    .optional(),
  urgency: z.enum(['IMMEDIATE', 'STANDARD', 'FLEXIBLE']).optional(),
  requirements: z.array(z.string().trim().min(1)).optional(),
  languageRequirements: z.array(z.string().trim().min(1)).optional(),
  skills: z.array(jobSkillInputSchema).optional(),
  location: jobLocationInputSchema.optional(),
});

/**
 * Filter query parameters for listing jobs.
 */
export const jobFilterQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.enum(['createdAt', 'startDate', 'wageAmount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateJobInput = z.input<typeof createJobSchema>;
export type CreateJobOutput = z.output<typeof createJobSchema>;
export type UpdateJobInput = z.input<typeof updateJobSchema>;
export type UpdateJobOutput = z.output<typeof updateJobSchema>;
export type JobFilterQuery = z.input<typeof jobFilterQuerySchema>;
export type JobFilterQueryOutput = z.output<typeof jobFilterQuerySchema>;
export type JobSkillInput = z.input<typeof jobSkillInputSchema>;
export type JobSkillOutput = z.output<typeof jobSkillInputSchema>;
export type JobLocationInput = z.input<typeof jobLocationInputSchema>;
export type JobLocationOutput = z.output<typeof jobLocationInputSchema>;

import { z } from 'zod';
import { pinCodeSchema } from './common.schema';

/**
 * Schema for updating an Employer profile.
 * Strictly prevents mutation of userId, verificationState, totalJobsPosted, totalHires.
 */
export const updateEmployerProfileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, { message: 'Business or company name must be at least 2 characters' })
    .max(150, { message: 'Business name cannot exceed 150 characters' })
    .optional(),
  description: z
    .string()
    .trim()
    .max(1000, { message: 'Description cannot exceed 1000 characters' })
    .nullable()
    .optional(),
  businessType: z
    .string()
    .trim()
    .max(50, { message: 'Business type cannot exceed 50 characters' })
    .nullable()
    .optional(),
  contactPreferences: z
    .array(z.string().trim().min(1))
    .min(1, { message: 'At least one contact preference is required' })
    .optional(),
  addressLine: z
    .string()
    .trim()
    .max(255, { message: 'Address line cannot exceed 255 characters' })
    .nullable()
    .optional(),
  locality: z
    .string()
    .trim()
    .min(2, { message: 'Locality must be at least 2 characters' })
    .max(100, { message: 'Locality cannot exceed 100 characters' })
    .optional(),
  city: z
    .string()
    .trim()
    .min(2, { message: 'City must be at least 2 characters' })
    .max(100, { message: 'City cannot exceed 100 characters' })
    .optional(),
  state: z
    .string()
    .trim()
    .min(2, { message: 'State must be at least 2 characters' })
    .max(100, { message: 'State cannot exceed 100 characters' })
    .optional(),
  pinCode: pinCodeSchema.optional(),
});

export type UpdateEmployerProfileInput = z.infer<typeof updateEmployerProfileSchema>;

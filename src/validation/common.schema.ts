import { z } from 'zod';

/**
 * Standard UUID validation schema.
 */
export const uuidSchema = z
  .string()
  .uuid({ message: 'Must be a valid UUID' });

/**
 * Standard Indian phone number validation schema.
 * Supports 10-digit mobile numbers starting with 6, 7, 8, 9,
 * or prefixed with +91 / 91.
 */
export const phoneNumberSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[\s\-()]/g, ''))
  .refine(
    (val) => /^(?:\+91|91)?[6-9]\d{9}$/.test(val),
    { message: 'Invalid phone number. Must be a valid 10-digit Indian mobile number.' }
  )
  .transform((val) => {
    if (val.startsWith('+91')) return val.slice(3);
    if (val.length === 12 && val.startsWith('91')) return val.slice(2);
    return val;
  });

/**
 * Indian 6-digit Postal PIN Code schema.
 */
export const pinCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, { message: 'Must be a valid 6-digit Indian PIN Code' });

/**
 * Latitude / Longitude coordinates schema.
 */
export const geoPointSchema = z.object({
  latitude: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90' })
    .max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180' })
    .max(180, { message: 'Longitude must be between -180 and 180' }),
});

/**
 * Pagination query schema.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, { message: 'Page must be greater than or equal to 1' })
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, { message: 'Limit must be at least 1' })
    .max(100, { message: 'Limit cannot exceed 100' })
    .default(20),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
});

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
export type GeoPointInput = z.infer<typeof geoPointSchema>;

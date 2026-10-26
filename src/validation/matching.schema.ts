import { z } from 'zod';
import { uuidSchema } from './common.schema';

export const workerJobDiscoveryQuerySchema = z.object({
  query: z.string().trim().min(1).max(100).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  skillId: uuidSchema.optional(),
  category: z.string().trim().min(1).max(50).optional(),
  wageType: z.enum(['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE']).optional(),
  minWage: z.coerce.number().min(0).optional(),
  maxWage: z.coerce.number().min(0).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  sort: z
    .enum(['score_desc', 'distance_asc', 'wage_desc', 'created_desc'])
    .default('score_desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type WorkerJobDiscoveryQueryInput = z.input<typeof workerJobDiscoveryQuerySchema>;
export type WorkerJobDiscoveryQueryOutput = z.output<typeof workerJobDiscoveryQuerySchema>;

export const nearbyJobsQuerySchema = z.object({
  radiusKm: z.coerce.number().positive().max(100).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type NearbyJobsQueryInput = z.input<typeof nearbyJobsQuerySchema>;
export type NearbyJobsQueryOutput = z.output<typeof nearbyJobsQuerySchema>;

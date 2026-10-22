import { z } from 'zod';

export const workerJobRecommendationQuerySchema = z.object({
  category: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional(),
  maxRadiusKm: z
    .coerce
    .number()
    .positive()
    .max(100)
    .optional(),
  page: z
    .coerce
    .number()
    .int()
    .min(1)
    .default(1),
  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
});

export type WorkerJobRecommendationQueryInput = z.input<typeof workerJobRecommendationQuerySchema>;
export type WorkerJobRecommendationQueryOutput = z.output<typeof workerJobRecommendationQuerySchema>;

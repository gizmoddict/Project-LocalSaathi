import { z } from 'zod';

export const createApplicationSchema = z.object({
  message: z
    .string()
    .trim()
    .max(1000, 'Application message must not exceed 1000 characters')
    .optional(),
});

export type CreateApplicationInput = z.input<typeof createApplicationSchema>;
export type CreateApplicationOutput = z.output<typeof createApplicationSchema>;

export const workerApplicationsQuerySchema = z.object({
  status: z
    .enum(['APPLIED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(['applied_at_desc', 'applied_at_asc'])
    .default('applied_at_desc'),
});

export type WorkerApplicationsQueryInput = z.input<typeof workerApplicationsQuerySchema>;
export type WorkerApplicationsQueryOutput = z.output<typeof workerApplicationsQuerySchema>;

export const employerApplicationsQuerySchema = z.object({
  status: z
    .enum(['APPLIED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(['match_score_desc', 'applied_at_desc', 'applied_at_asc', 'distance_asc'])
    .default('match_score_desc'),
});

export type EmployerApplicationsQueryInput = z.input<typeof employerApplicationsQuerySchema>;
export type EmployerApplicationsQueryOutput = z.output<typeof employerApplicationsQuerySchema>;

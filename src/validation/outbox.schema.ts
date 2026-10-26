import { z } from 'zod';
import { OutboxStatus } from '@localsaathi/types';

export const outboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(OutboxStatus).optional(),
  eventType: z.string().optional(),
  aggregateType: z.string().optional(),
  aggregateId: z.string().uuid().optional(),
});

export type OutboxQueryInput = z.infer<typeof outboxQuerySchema>;

export const domainEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  eventVersion: z.number().int().min(1).default(1),
  occurredAt: z.string(),
  aggregateType: z.string().min(1),
  aggregateId: z.string().uuid(),
  actorId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
  metadata: z
    .object({
      requestId: z.string().optional(),
      correlationId: z.string().optional(),
      traceId: z.string().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export type DomainEventEnvelopeInput = z.infer<typeof domainEventEnvelopeSchema>;

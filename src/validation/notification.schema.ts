import { z } from 'zod';

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .union([z.string().transform((v) => v === 'true'), z.boolean()])
    .optional(),
  type: z.string().optional(),
  cursor: z.string().optional(),
});

export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;

export const updateNotificationPreferenceSchema = z.object({
  applicationUpdates: z.boolean().optional(),
  bookingUpdates: z.boolean().optional(),
  jobUpdates: z.boolean().optional(),
  messageUpdates: z.boolean().optional(),
  systemUpdates: z.boolean().optional(),
});

export type UpdateNotificationPreferenceInput = z.infer<
  typeof updateNotificationPreferenceSchema
>;


import { z } from 'zod';

export const conversationTypeEnum = z.enum([
  'DIRECT',
  'GROUP',
  'JOB_RELATED',
  'BOOKING_RELATED',
  'JOB_CONTEXT',
]);

export const messageTypeEnum = z.enum([
  'TEXT',
  'IMAGE',
  'VOICE',
  'AUDIO',
  'SYSTEM',
  'JOB',
  'BOOKING',
]);

export const reportReasonEnum = z.enum([
  'SPAM',
  'HARASSMENT',
  'SCAM',
  'INAPPROPRIATE_CONTENT',
  'FRAUD',
  'OTHER',
]);

export const messageAttachmentInputSchema = z.object({
  fileType: z.string().min(1).max(50),
  fileUrl: z.string().url(),
  fileName: z.string().max(255).optional(),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
  duration: z.number().int().nonnegative().optional(),
  storageKey: z.string().max(255).optional(),
});

export const createConversationSchema = z.object({
  recipientUserId: z.string().uuid(),
  jobPostId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  type: conversationTypeEnum.default('DIRECT'),
  initialMessage: z.string().min(1).max(4000).optional(),
});

export const sendMessageSchema = z.object({
  clientMessageId: z.string().min(1).max(100),
  type: messageTypeEnum.default('TEXT'),
  body: z.string().min(1).max(4000),
  replyToMessageId: z.string().uuid().optional(),
  attachments: z.array(messageAttachmentInputSchema).optional(),
});

export const updateMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const blockUserSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const reportMessageSchema = z.object({
  reason: reportReasonEnum,
  details: z.string().max(1000).optional(),
});

export const conversationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  archived: z
    .preprocess((val) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return val;
    }, z.boolean())
    .optional(),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  direction: z.enum(['before', 'after']).default('before'),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
export type ConversationListQueryInput = z.infer<typeof conversationListQuerySchema>;
export type MessageListQueryInput = z.infer<typeof messageListQuerySchema>;

import { z } from 'zod';

export const verificationTypeSchema = z.enum([
  'AADHAAR',
  'PAN',
  'DRIVING_LICENSE',
  'VOTER_ID',
  'PASSPORT',
  'BUSINESS_REGISTRATION',
  'OTHER',
]);

export const documentTypeSchema = z.enum([
  'GOVERNMENT_ID',
  'TRADE_CERTIFICATE',
  'PROFILE_IMAGE',
  'WORK_SAMPLE',
  'BUSINESS_PROOF',
  'ADDRESS_PROOF',
]);

export const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const verificationDocumentItemSchema = z.object({
  type: documentTypeSchema,
  objectStorageKey: z
    .string()
    .min(1, 'objectStorageKey is required')
    .max(255, 'objectStorageKey too long'),
  mimeType: z.string().refine(
    (val) => allowedMimeTypes.includes(val as any),
    {
      message: 'Invalid MIME type. Supported formats: image/jpeg, image/png, image/webp, application/pdf',
    }
  ),
  fileSizeBytes: z
    .number()
    .int()
    .positive('File size must be positive')
    .max(5 * 1024 * 1024, 'File size cannot exceed 5MB'),
});

export const submitVerificationSchema = z.object({
  verificationType: verificationTypeSchema,
  providerReference: z.string().max(100).optional(),
  documents: z
    .array(verificationDocumentItemSchema)
    .min(1, 'At least one document is required for verification')
    .max(5, 'Maximum 5 documents can be submitted at once'),
});

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

export const createReportSchema = z.object({
  reason: z
    .string()
    .min(3, 'Reason must be at least 3 characters')
    .max(100, 'Reason must be at most 100 characters'),
  details: z
    .string()
    .max(1000, 'Details cannot exceed 1000 characters')
    .optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const createDisputeSchema = z.object({
  reason: z
    .string()
    .min(3, 'Dispute reason must be at least 3 characters')
    .max(200, 'Dispute reason must be at most 200 characters'),
  description: z
    .string()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional(),
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const resolveDisputeSchema = z.object({
  resolution: z
    .string()
    .min(3, 'Resolution must be at least 3 characters')
    .max(1000, 'Resolution must be at most 1000 characters'),
  notes: z
    .string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional(),
});

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const reviewVerificationSchema = z.object({
  notes: z.string().max(500).optional(),
  rejectionReason: z.string().max(500).optional(),
});

export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;

export const moderationActionTypeSchema = z.enum([
  'NONE',
  'DISMISS',
  'WARNING',
  'CONTENT_REMOVAL',
  'CAPABILITY_RESTRICTION',
  'SUSPENSION',
  'APPROVE_VERIFICATION',
  'REJECT_VERIFICATION',
  'SETTLE_DISPUTE',
]);

export const resolveCaseSchema = z.object({
  resolution: moderationActionTypeSchema,
  notes: z
    .string()
    .max(1000, 'Resolution notes cannot exceed 1000 characters')
    .optional(),
});

export type ResolveCaseInput = z.infer<typeof resolveCaseSchema>;

export const escalateCaseSchema = z.object({
  notes: z
    .string()
    .max(500, 'Escalation notes cannot exceed 500 characters')
    .optional(),
});

export type EscalateCaseInput = z.infer<typeof escalateCaseSchema>;

export const suspendUserSchema = z.object({
  reason: z
    .string()
    .min(3, 'Suspension reason must be at least 3 characters')
    .max(500, 'Suspension reason cannot exceed 500 characters'),
});

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const reinstateUserSchema = z.object({
  reason: z
    .string()
    .max(500, 'Reinstatement reason cannot exceed 500 characters')
    .optional(),
});

export type ReinstateUserInput = z.infer<typeof reinstateUserSchema>;

export const restrictionTypeSchema = z.enum([
  'CANNOT_MESSAGE',
  'CANNOT_POST_JOBS',
  'CANNOT_APPLY',
  'CANNOT_ACCEPT_BOOKINGS',
  'TEMPORARY_SUSPENSION',
]);

export const applyUserRestrictionSchema = z.object({
  restrictionType: restrictionTypeSchema,
  reason: z
    .string()
    .min(3, 'Restriction reason must be at least 3 characters')
    .max(500, 'Restriction reason cannot exceed 500 characters'),
  expiresAt: z.string().datetime().optional(),
});

export type ApplyUserRestrictionInput = z.infer<typeof applyUserRestrictionSchema>;

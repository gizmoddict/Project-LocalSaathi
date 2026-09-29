/**
 * LocalSaathi Queue Names partition key.
 * Reserved for later phases (BullMQ queues).
 */
export enum QueueName {
  NOTIFICATIONS = 'notifications-queue',
  SMS_OTP = 'sms-otp-queue',
  SEARCH_INDEX = 'search-index-queue',
  EMBEDDINGS = 'embeddings-queue',
  AUDIO_TRANSCRIPTION = 'audio-transcription-queue',
  PAYMENT_RECONCILIATION = 'payment-reconciliation-queue',
}

export interface BaseJobData {
  jobId: string;
  traceId: string;
  createdAt: string;
}

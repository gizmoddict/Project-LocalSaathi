export type ConversationType =
  | 'DIRECT'
  | 'GROUP'
  | 'JOB_RELATED'
  | 'BOOKING_RELATED'
  | 'JOB_CONTEXT';

export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VOICE'
  | 'AUDIO'
  | 'SYSTEM'
  | 'JOB'
  | 'BOOKING';

export type PresenceStatus = 'ONLINE' | 'OFFLINE' | 'AWAY';

export type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'SCAM'
  | 'INAPPROPRIATE_CONTENT'
  | 'FRAUD'
  | 'OTHER';

export interface MessageAttachmentDto {
  id: string;
  messageId: string;
  fileType: string;
  fileUrl: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  duration?: number | null;
  storageKey?: string | null;
  createdAt: string;
}

export interface MessageReadReceiptDto {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
}

export interface MessageReactionDto {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface MessageSenderDto {
  id: string;
  role: string;
  displayName?: string;
  phone?: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string | null;
  sequenceNumber: number;
  messageType: MessageType;
  body?: string | null;
  content?: string | null;
  attachmentKey?: string | null;
  replyToMessageId?: string | null;
  createdAt: string;
  sentAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  attachments?: MessageAttachmentDto[];
  readReceipts?: MessageReadReceiptDto[];
  reactions?: MessageReactionDto[];
  sender?: MessageSenderDto;
}

export interface ConversationMemberUserDto {
  id: string;
  phone: string;
  role: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ConversationMemberDto {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  mutedAt?: string | null;
  archivedAt?: string | null;
  unreadCount: number;
  user?: ConversationMemberUserDto;
}

export interface ConversationDto {
  id: string;
  type: ConversationType;
  jobPostId?: string | null;
  applicationId?: string | null;
  bookingId?: string | null;
  lastMessageAt?: string | null;
  lastMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
  members: ConversationMemberDto[];
  lastMessage?: MessageDto | null;
  unreadCount?: number;
}

export interface CreateConversationRequest {
  recipientUserId: string;
  jobPostId?: string;
  applicationId?: string;
  bookingId?: string;
  type?: ConversationType;
  initialMessage?: string;
}

export interface SendMessageRequest {
  clientMessageId: string;
  type?: MessageType;
  body: string;
  replyToMessageId?: string;
  attachments?: Array<{
    fileType: string;
    fileUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number;
    storageKey?: string;
  }>;
}

export interface UpdateMessageRequest {
  body: string;
}

export interface BlockUserRequest {
  reason?: string;
}

export interface ReportMessageRequest {
  reason: ReportReason;
  details?: string;
}

export interface ConversationListQuery {
  limit?: number;
  cursor?: string;
  archived?: boolean;
}

export interface MessageListQuery {
  limit?: number;
  cursor?: string;
  direction?: 'before' | 'after';
}

export interface TypingIndicatorPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  timestamp: string;
}

export interface PresencePayload {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
}

export interface WebSocketMessagingEvent {
  event:
    | 'message.created'
    | 'message.updated'
    | 'message.deleted'
    | 'message.read'
    | 'typing.started'
    | 'typing.stopped'
    | 'presence.updated'
    | 'conversation.updated';
  conversationId?: string;
  message?: MessageDto;
  readReceipt?: {
    conversationId: string;
    userId: string;
    lastReadMessageId: string;
    lastReadAt: string;
  };
  typing?: {
    conversationId: string;
    userId: string;
  };
  presence?: {
    userId: string;
    status: PresenceStatus;
  };
  timestamp: string;
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  MESSAGING_CONSTANTS,
  MESSAGING_ERROR_CODES,
  WS_MESSAGING_EVENTS,
} from '../messaging.constants';
import { ConversationService } from './conversation.service';
import { BlockReportService } from './block-report.service';
import { MessagingDispatcherService } from '../realtime/messaging-dispatcher.service';
import {
  SendMessageRequest,
  UpdateMessageRequest,
  MessageListQuery,
  MessageDto,
  DomainEventType,
} from '@localsaathi/types';
import { SecurityUtils } from '../../../common/utils/security.utils';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationService: ConversationService,
    private readonly blockReportService: BlockReportService,
    private readonly dispatcher: MessagingDispatcherService,
  ) {}

  /**
   * Sends a message into a conversation with strict idempotency and monotonic sequence ordering.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    input: SendMessageRequest,
  ): Promise<MessageDto> {
    // 1. Authorization: verify sender is a member of the conversation
    await this.conversationService.assertMember(conversationId, senderId);

    // 2. Load conversation members to identify recipient and check blocking
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                role: true,
                workerProfile: { select: { displayName: true } },
                employerProfile: { select: { businessName: true } },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.CONVERSATION_NOT_FOUND,
        message: 'Conversation not found.',
      });
    }

    const otherMember = conversation.members.find((m) => m.userId !== senderId);
    if (otherMember) {
      const isBlocked = await this.blockReportService.isBlocked(
        senderId,
        otherMember.userId,
      );
      if (isBlocked) {
        throw new ForbiddenException({
          code: MESSAGING_ERROR_CODES.USER_BLOCKED,
          message: 'Cannot send message. Communication is blocked between these users.',
        });
      }
    }

    // 2.1 Check capability restriction
    const messagingRestriction = await this.prisma.userRestriction?.findFirst?.({
      where: {
        userId: senderId,
        restrictionType: 'CANNOT_MESSAGE' as any,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (messagingRestriction) {
      throw new ForbiddenException({
        code: 'USER_RESTRICTED',
        message: `Messaging is restricted on your account: ${messagingRestriction.reason}`,
      });
    }

    // 3. IDEMPOTENCY CHECK: if clientMessageId already exists for this sender in this conversation,
    // return existing message immediately without re-inserting or duplicating sequence numbers.
    if (input.clientMessageId) {
      const existingMsg = await this.prisma.message.findUnique({
        where: {
          conversationId_senderId_clientMessageId: {
            conversationId,
            senderId,
            clientMessageId: input.clientMessageId,
          },
        },
        include: {
          attachments: true,
          readReceipts: true,
          reactions: true,
          sender: {
            select: {
              id: true,
              role: true,
              workerProfile: { select: { displayName: true } },
              employerProfile: { select: { businessName: true } },
            },
          },
        },
      });

      if (existingMsg) {
        this.logger.debug(
          `Idempotent hit: Returning existing message id=${existingMsg.id} for clientMessageId=${input.clientMessageId}`,
        );
        return this.formatMessage(existingMsg);
      }
    }

    // 4. Resolve sender display name for outbox / notifications
    const senderMember = conversation.members.find((m) => m.userId === senderId);
    const senderName =
      senderMember?.user.workerProfile?.displayName ??
      senderMember?.user.employerProfile?.businessName ??
      'User';

    // 5. Atomic transaction: Monotonic sequence increment + Persistence + Outbox
    const message = await this.prisma.$transaction(async (tx) => {
      // Row-level lock on conversation to serialize sequenceNumber generation per conversation
      if (typeof (tx as any).$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      }

      // Find current maximum sequenceNumber in this conversation
      const lastMsg = await tx.message.findFirst({
        where: { conversationId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });
      const nextSequence = (lastMsg?.sequenceNumber ?? 0) + 1;

      const bodyText = SecurityUtils.sanitizeText(input.body.trim());

      const created = await tx.message.create({
        data: {
          conversationId,
          senderId,
          clientMessageId: input.clientMessageId,
          sequenceNumber: nextSequence,
          messageType: (input.type as any) ?? 'TEXT',
          body: bodyText,
          content: bodyText,
          replyToMessageId: input.replyToMessageId,
        },
      });

      // Handle attachments if provided
      if (input.attachments && input.attachments.length > 0) {
        for (const att of input.attachments) {
          await tx.messageAttachment.create({
            data: {
              messageId: created.id,
              fileType: att.fileType,
              fileUrl: att.fileUrl,
              fileName: att.fileName,
              fileSize: att.fileSize,
              mimeType: att.mimeType,
              duration: att.duration,
              storageKey: att.storageKey,
            },
          });
        }
      }

      // Update conversation lastMessageAt and lastMessageId
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessageId: created.id,
        },
      });

      // Increment unread count for other members
      await tx.conversationMember.updateMany({
        where: {
          conversationId,
          userId: { not: senderId },
        },
        data: {
          unreadCount: { increment: 1 },
        },
      });

      // Recipient id
      const recipientId = otherMember?.userId;

      // Create DomainEvent
      await tx.domainEvent.create({
        data: {
          type: DomainEventType.MESSAGE_CREATED,
          actorId: senderId,
          entityType: 'Message',
          entityId: created.id,
          payload: {
            messageId: created.id,
            conversationId,
            senderId,
            recipientId,
            senderName,
            preview:
              bodyText.length > 80 ? `${bodyText.slice(0, 80)}...` : bodyText,
            sequenceNumber: nextSequence,
          },
        },
      });

      // Create OutboxEvent
      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.MESSAGE_CREATED,
          aggregateType: 'Message',
          aggregateId: created.id,
          actorId: senderId,
          payload: {
            messageId: created.id,
            conversationId,
            senderId,
            recipientId,
            senderName,
            preview:
              bodyText.length > 80 ? `${bodyText.slice(0, 80)}...` : bodyText,
            sequenceNumber: nextSequence,
          },
        },
      });

      return created;
    });

    // 6. Fetch full message with attachments
    const fullMessage = await this.getMessageEntity(message.id);
    const formatted = this.formatMessage(fullMessage!);

    // 7. Dispatch real-time WebSocket event via Redis Pub/Sub / Socket.IO
    await this.dispatcher.broadcast({
      conversationId,
      recipientId: otherMember?.userId,
      envelope: {
        event: WS_MESSAGING_EVENTS.MESSAGE_CREATED,
        conversationId,
        message: formatted,
        timestamp: new Date().toISOString(),
      },
    });

    return formatted;
  }

  /**
   * Retrieves messages in a conversation using deterministic sequence-number and cursor pagination.
   */
  async listMessages(
    conversationId: string,
    userId: string,
    query: MessageListQuery,
  ): Promise<{
    messages: MessageDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    await this.conversationService.assertMember(conversationId, userId);

    const limit = Math.min(
      Math.max(query.limit ?? MESSAGING_CONSTANTS.DEFAULT_MESSAGE_LIMIT, 1),
      MESSAGING_CONSTANTS.MAX_MESSAGE_LIMIT,
    );

    let cursorSequence: number | null = null;
    if (query.cursor) {
      const cursorMsg = await this.prisma.message.findUnique({
        where: { id: query.cursor },
        select: { sequenceNumber: true },
      });
      if (cursorMsg) {
        cursorSequence = cursorMsg.sequenceNumber;
      }
    }

    const direction = query.direction ?? 'before';

    // If direction === 'before': fetch messages with sequenceNumber < cursorSequence (for scrolling up)
    // If direction === 'after': fetch messages with sequenceNumber > cursorSequence (for syncing missed messages)
    const sequenceFilter =
      cursorSequence !== null
        ? direction === 'after'
          ? { gt: cursorSequence }
          : { lt: cursorSequence }
        : undefined;

    const items = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(sequenceFilter && { sequenceNumber: sequenceFilter }),
      },
      take: limit + 1,
      orderBy: { sequenceNumber: 'asc' },
      include: {
        attachments: true,
        readReceipts: true,
        reactions: true,
        sender: {
          select: {
            id: true,
            role: true,
            workerProfile: { select: { displayName: true } },
            employerProfile: { select: { businessName: true } },
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const messages = (hasMore ? items.slice(0, limit) : items).map((m) =>
      this.formatMessage(m),
    );

    const nextCursor =
      hasMore && messages.length > 0
        ? (messages[messages.length - 1]?.id ?? null)
        : null;

    return {
      messages,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Edits a text message.
   */
  async updateMessage(
    messageId: string,
    userId: string,
    input: UpdateMessageRequest,
  ): Promise<MessageDto> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        attachments: true,
        readReceipts: true,
        reactions: true,
        sender: {
          select: {
            id: true,
            role: true,
            workerProfile: { select: { displayName: true } },
            employerProfile: { select: { businessName: true } },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.MESSAGE_NOT_FOUND,
        message: 'Message not found.',
      });
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException({
        code: MESSAGING_ERROR_CODES.MESSAGE_EDIT_FORBIDDEN,
        message: 'You can only edit your own messages.',
      });
    }

    if (message.deletedAt !== null) {
      throw new BadRequestException({
        code: MESSAGING_ERROR_CODES.MESSAGE_ALREADY_DELETED,
        message: 'Cannot edit a deleted message.',
      });
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        body: input.body.trim(),
        content: input.body.trim(),
        editedAt: new Date(),
      },
      include: {
        attachments: true,
        readReceipts: true,
        reactions: true,
        sender: {
          select: {
            id: true,
            role: true,
            workerProfile: { select: { displayName: true } },
            employerProfile: { select: { businessName: true } },
          },
        },
      },
    });

    const formatted = this.formatMessage(updated);

    await this.dispatcher.broadcast({
      conversationId: updated.conversationId,
      envelope: {
        event: WS_MESSAGING_EVENTS.MESSAGE_UPDATED,
        conversationId: updated.conversationId,
        message: formatted,
        timestamp: new Date().toISOString(),
      },
    });

    return formatted;
  }

  /**
   * Soft-deletes a message.
   */
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.MESSAGE_NOT_FOUND,
        message: 'Message not found.',
      });
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException({
        code: MESSAGING_ERROR_CODES.MESSAGE_DELETE_FORBIDDEN,
        message: 'You can only delete your own messages.',
      });
    }

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        body: 'Message deleted',
        content: 'Message deleted',
      },
    });

    await this.dispatcher.broadcast({
      conversationId: deleted.conversationId,
      envelope: {
        event: WS_MESSAGING_EVENTS.MESSAGE_DELETED,
        conversationId: deleted.conversationId,
        message: {
          id: deleted.id,
          conversationId: deleted.conversationId,
          senderId: deleted.senderId,
          sequenceNumber: deleted.sequenceNumber,
          messageType: deleted.messageType,
          body: 'Message deleted',
          content: 'Message deleted',
          deletedAt: deleted.deletedAt?.toISOString(),
          createdAt: (deleted.createdAt ?? deleted.sentAt).toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    return {
      id: messageId,
      conversationId: deleted.conversationId,
      deleted: true,
      deletedAt: deleted.deletedAt?.toISOString(),
    };
  }

  /**
   * Marks a conversation as read by the user up to a specified message sequence/ID.
   */
  async markAsRead(
    conversationId: string,
    userId: string,
    lastReadMessageId?: string,
  ) {
    await this.conversationService.assertMember(conversationId, userId);

    // If lastReadMessageId not provided, find the newest message in the conversation
    let targetMsgId = lastReadMessageId;
    if (!targetMsgId) {
      const newest = await this.prisma.message.findFirst({
        where: { conversationId },
        orderBy: { sequenceNumber: 'desc' },
        select: { id: true },
      });
      targetMsgId = newest?.id;
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Update ConversationMember read cursor and reset unreadCount
      await tx.conversationMember.update({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        data: {
          lastReadMessageId: targetMsgId,
          lastReadAt: now,
          unreadCount: 0,
        },
      });

      // Create read receipt for target message if present
      if (targetMsgId) {
        await tx.messageReadReceipt.upsert({
          where: {
            messageId_userId: { messageId: targetMsgId, userId },
          },
          create: {
            messageId: targetMsgId,
            userId,
            readAt: now,
          },
          update: {
            readAt: now,
          },
        });
      }
    });

    // Broadcast read event to conversation room
    await this.dispatcher.broadcast({
      conversationId,
      envelope: {
        event: WS_MESSAGING_EVENTS.MESSAGE_READ,
        conversationId,
        readReceipt: {
          conversationId,
          userId,
          lastReadMessageId: targetMsgId ?? '',
          lastReadAt: now.toISOString(),
        },
        timestamp: now.toISOString(),
      },
    });

    return {
      conversationId,
      userId,
      lastReadMessageId: targetMsgId ?? null,
      lastReadAt: now.toISOString(),
    };
  }

  private async getMessageEntity(messageId: string) {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        attachments: true,
        readReceipts: true,
        reactions: true,
        sender: {
          select: {
            id: true,
            role: true,
            workerProfile: { select: { displayName: true } },
            employerProfile: { select: { businessName: true } },
          },
        },
      },
    });
  }

  private formatMessage(msg: any): MessageDto {
    const isDeleted = !!msg.deletedAt;
    const bodyContent = isDeleted ? 'Message deleted' : msg.body ?? msg.content;

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      clientMessageId: msg.clientMessageId,
      sequenceNumber: msg.sequenceNumber,
      messageType: msg.messageType,
      body: bodyContent,
      content: bodyContent,
      attachmentKey: msg.attachmentKey,
      replyToMessageId: msg.replyToMessageId,
      createdAt: (msg.createdAt ?? msg.sentAt).toISOString(),
      sentAt: (msg.createdAt ?? msg.sentAt).toISOString(),
      editedAt: msg.editedAt?.toISOString() ?? null,
      deletedAt: msg.deletedAt?.toISOString() ?? null,
      attachments: (msg.attachments ?? []).map((att: any) => ({
        id: att.id,
        messageId: att.messageId,
        fileType: att.fileType,
        fileUrl: att.fileUrl,
        fileName: att.fileName,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        duration: att.duration,
        storageKey: att.storageKey,
        createdAt: att.createdAt.toISOString(),
      })),
      readReceipts: (msg.readReceipts ?? []).map((rr: any) => ({
        id: rr.id,
        messageId: rr.messageId,
        userId: rr.userId,
        readAt: rr.readAt.toISOString(),
      })),
      reactions: (msg.reactions ?? []).map((rx: any) => ({
        id: rx.id,
        messageId: rx.messageId,
        userId: rx.userId,
        emoji: rx.emoji,
        createdAt: rx.createdAt.toISOString(),
      })),
      sender: msg.sender
        ? {
            id: msg.sender.id,
            role: msg.sender.role,
            displayName:
              msg.sender.workerProfile?.displayName ??
              msg.sender.employerProfile?.businessName ??
              'User',
          }
        : undefined,
    };
  }
}

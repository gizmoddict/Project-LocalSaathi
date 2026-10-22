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
import { BlockReportService } from './block-report.service';
import { MessagingDispatcherService } from '../realtime/messaging-dispatcher.service';
import {
  ConversationDto,
  CreateConversationRequest,
  ConversationListQuery,
  DomainEventType,
} from '@localsaathi/types';
import { randomUUID } from 'crypto';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockReportService: BlockReportService,
    private readonly dispatcher: MessagingDispatcherService,
  ) {}

  /**
   * Strict IDOR protection: Verifies caller is a member of the requested conversation.
   */
  async assertMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: MESSAGING_ERROR_CODES.CONVERSATION_ACCESS_DENIED,
        message: 'You are not authorized to access this conversation.',
      });
    }

    return member;
  }

  /**
   * Creates a new conversation or returns an existing DIRECT conversation between two users.
   */
  async createConversation(
    userId: string,
    input: CreateConversationRequest,
  ): Promise<ConversationDto> {
    if (userId === input.recipientUserId) {
      throw new BadRequestException({
        code: MESSAGING_ERROR_CODES.CANNOT_MESSAGE_SELF,
        message: 'You cannot start a conversation with yourself.',
      });
    }

    // 1. Verify recipient exists and is active
    const recipient = await this.prisma.user.findUnique({
      where: { id: input.recipientUserId },
      include: {
        workerProfile: { select: { displayName: true } },
        employerProfile: {
          select: { businessName: true, contactPreferences: true },
        },
      },
    });

    if (!recipient || recipient.accountStatus !== 'ACTIVE') {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.RECIPIENT_NOT_FOUND,
        message: 'Recipient not found or account is not active.',
      });
    }

    // 2. Check blocking
    const isBlocked = await this.blockReportService.isBlocked(
      userId,
      input.recipientUserId,
    );
    if (isBlocked) {
      throw new ForbiddenException({
        code: MESSAGING_ERROR_CODES.USER_BLOCKED,
        message: 'Communication is blocked between these users.',
      });
    }

    // 3. Check for existing DIRECT conversation between these two users
    const existing = await this.findDirectConversation(
      userId,
      input.recipientUserId,
    );
    if (existing) {
      this.logger.debug(
        `Returning existing conversation ${existing.id} between ${userId} and ${input.recipientUserId}`,
      );
      return this.formatConversation(existing, userId);
    }

    // 4. Policy check: Worker <-> Employer communication allowed if:
    //    a) Application exists
    //    b) OR Booking exists
    //    c) OR Employer explicitly enables contact
    const isAllowed = await this.checkCreationPolicy(
      userId,
      input.recipientUserId,
      recipient,
      input.jobPostId,
      input.applicationId,
      input.bookingId,
    );

    if (!isAllowed) {
      throw new ForbiddenException({
        code: MESSAGING_ERROR_CODES.CONVERSATION_CREATION_NOT_ALLOWED,
        message:
          'Conversations require an active application, booking, or contact permission.',
      });
    }

    // 5. Create conversation atomically with members and optional initial message
    const conversation = await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          type: (input.type as any) ?? 'DIRECT',
          jobPostId: input.jobPostId,
          applicationId: input.applicationId,
          bookingId: input.bookingId,
        },
      });

      // Add caller member
      await tx.conversationMember.create({
        data: {
          conversationId: conv.id,
          userId,
          unreadCount: 0,
        },
      });

      // Add recipient member
      await tx.conversationMember.create({
        data: {
          conversationId: conv.id,
          userId: input.recipientUserId,
          unreadCount: input.initialMessage ? 1 : 0,
        },
      });

      // Optional initial message
      if (input.initialMessage && input.initialMessage.trim().length > 0) {
        const msg = await tx.message.create({
          data: {
            conversationId: conv.id,
            senderId: userId,
            clientMessageId: randomUUID(),
            sequenceNumber: 1,
            messageType: 'TEXT',
            body: input.initialMessage.trim(),
            content: input.initialMessage.trim(),
          },
        });

        await tx.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: new Date(),
            lastMessageId: msg.id,
          },
        });
      }

      // Outbox and Domain Event
      await tx.domainEvent.create({
        data: {
          type: DomainEventType.CONVERSATION_CREATED,
          actorId: userId,
          entityType: 'Conversation',
          entityId: conv.id,
          payload: {
            conversationId: conv.id,
            creatorId: userId,
            recipientId: input.recipientUserId,
            hasInitialMessage: !!input.initialMessage,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.CONVERSATION_CREATED,
          aggregateType: 'Conversation',
          aggregateId: conv.id,
          actorId: userId,
          payload: {
            conversationId: conv.id,
            creatorId: userId,
            recipientId: input.recipientUserId,
          },
        },
      });

      return conv;
    });

    const fullConv = await this.getConversationEntity(conversation.id);
    const formatted = this.formatConversation(fullConv!, userId);

    // Broadcast conversation update to recipient
    await this.dispatcher.broadcast({
      recipientId: input.recipientUserId,
      envelope: {
        event: WS_MESSAGING_EVENTS.CONVERSATION_UPDATED,
        conversationId: conversation.id,
        timestamp: new Date().toISOString(),
      },
    });

    return formatted;
  }

  /**
   * Lists conversations for a user with cursor pagination.
   */
  async listConversations(
    userId: string,
    query: ConversationListQuery,
  ): Promise<{
    conversations: ConversationDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(
      Math.max(query.limit ?? MESSAGING_CONSTANTS.DEFAULT_CONVERSATION_LIMIT, 1),
      100,
    );

    const whereClause: any = {
      members: {
        some: {
          userId,
          ...(query.archived !== undefined && {
            archivedAt: query.archived ? { not: null } : null,
          }),
        },
      },
    };

    const items = await this.prisma.conversation.findMany({
      where: whereClause,
      take: limit + 1,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1,
      }),
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                role: true,
                workerProfile: {
                  select: { displayName: true, profilePhotoKey: true },
                },
                employerProfile: { select: { businessName: true } },
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { sequenceNumber: 'desc' },
          include: {
            attachments: true,
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const conversations = (hasMore ? items.slice(0, limit) : items).map((c) =>
      this.formatConversation(c, userId),
    );

    const nextCursor =
      hasMore && conversations.length > 0
        ? (conversations[conversations.length - 1]?.id ?? null)
        : null;

    return {
      conversations,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Retrieves a single conversation by ID with IDOR verification.
   */
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationDto> {
    await this.assertMember(conversationId, userId);

    const conv = await this.getConversationEntity(conversationId);
    if (!conv) {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.CONVERSATION_NOT_FOUND,
        message: 'Conversation not found.',
      });
    }

    return this.formatConversation(conv, userId);
  }

  /**
   * Global unread messages count across all conversations.
   */
  async getGlobalUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const aggregations = await this.prisma.conversationMember.aggregate({
      where: { userId },
      _sum: { unreadCount: true },
    });

    return {
      unreadCount: aggregations._sum.unreadCount ?? 0,
    };
  }

  /**
   * Mutes or unmutes a conversation.
   */
  async muteConversation(
    conversationId: string,
    userId: string,
    mute: boolean,
  ) {
    await this.assertMember(conversationId, userId);

    await this.prisma.conversationMember.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: {
        mutedAt: mute ? new Date() : null,
      },
    });

    return { conversationId, isMuted: mute };
  }

  /**
   * Archives or unarchives a conversation.
   */
  async archiveConversation(
    conversationId: string,
    userId: string,
    archive: boolean,
  ) {
    await this.assertMember(conversationId, userId);

    await this.prisma.conversationMember.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: {
        archivedAt: archive ? new Date() : null,
      },
    });

    return { conversationId, isArchived: archive };
  }

  // Helper: Finds an existing DIRECT conversation between two users
  private async findDirectConversation(userA: string, userB: string) {
    return this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: userA } } },
          { members: { some: { userId: userB } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                role: true,
                workerProfile: {
                  select: { displayName: true, profilePhotoKey: true },
                },
                employerProfile: { select: { businessName: true } },
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { sequenceNumber: 'desc' },
          include: { attachments: true },
        },
      },
    });
  }

  // Helper: Verifies policy rules for creating a conversation
  private async checkCreationPolicy(
    userA: string,
    userB: string,
    recipient: any,
    jobPostId?: string,
    applicationId?: string,
    bookingId?: string,
  ): Promise<boolean> {
    // 1. If explicit context IDs supplied, verify validity
    if (jobPostId) {
      const job = await this.prisma.jobPost.findUnique({
        where: { id: jobPostId },
        include: { employerProfile: true },
      });
      if (
        job &&
        (job.employerProfile.userId === userA ||
          job.employerProfile.userId === userB)
      ) {
        return true;
      }
    }

    if (applicationId) {
      const app = await this.prisma.jobApplication.findUnique({
        where: { id: applicationId },
        include: {
          workerProfile: true,
          jobPost: { include: { employerProfile: true } },
        },
      });
      if (
        app &&
        ((app.workerProfile.userId === userA &&
          app.jobPost.employerProfile.userId === userB) ||
          (app.workerProfile.userId === userB &&
            app.jobPost.employerProfile.userId === userA))
      ) {
        return true;
      }
    }

    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          workerProfile: true,
          employerProfile: true,
        },
      });
      if (
        booking &&
        ((booking.workerProfile.userId === userA &&
          booking.employerProfile.userId === userB) ||
          (booking.workerProfile.userId === userB &&
            booking.employerProfile.userId === userA))
      ) {
        return true;
      }
    }

    // 2. Check if ANY application exists between worker and employer
    const appExists = await this.prisma.jobApplication.findFirst({
      where: {
        OR: [
          {
            workerProfile: { userId: userA },
            jobPost: { employerProfile: { userId: userB } },
          },
          {
            workerProfile: { userId: userB },
            jobPost: { employerProfile: { userId: userA } },
          },
        ],
      },
    });
    if (appExists) return true;

    // 3. Check if ANY booking exists
    const bookingExists = await this.prisma.booking.findFirst({
      where: {
        OR: [
          {
            workerProfile: { userId: userA },
            employerProfile: { userId: userB },
          },
          {
            workerProfile: { userId: userB },
            employerProfile: { userId: userA },
          },
        ],
      },
    });
    if (bookingExists) return true;

    // 4. Check if employer profile has IN_APP contact enabled
    const callerUser = await this.prisma.user.findUnique({
      where: { id: userA },
      include: { employerProfile: true },
    });

    const employerContactPrefs =
      recipient.employerProfile?.contactPreferences ||
      callerUser?.employerProfile?.contactPreferences ||
      [];

    if (
      Array.isArray(employerContactPrefs) &&
      (employerContactPrefs.includes('IN_APP') ||
        employerContactPrefs.includes('PHONE'))
    ) {
      return true;
    }

    return false;
  }

  private async getConversationEntity(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                role: true,
                workerProfile: {
                  select: { displayName: true, profilePhotoKey: true },
                },
                employerProfile: { select: { businessName: true } },
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { sequenceNumber: 'desc' },
          include: { attachments: true },
        },
      },
    });
  }

  private formatConversation(conv: any, currentUserId: string): ConversationDto {
    const currentMember = conv.members.find(
      (m: any) => m.userId === currentUserId,
    );
    const lastMsg = conv.messages && conv.messages[0] ? conv.messages[0] : null;

    return {
      id: conv.id,
      type: conv.type,
      jobPostId: conv.jobPostId,
      applicationId: conv.applicationId,
      bookingId: conv.bookingId,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      lastMessageId: conv.lastMessageId,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      unreadCount: currentMember?.unreadCount ?? 0,
      members: conv.members.map((m: any) => ({
        id: m.id,
        conversationId: m.conversationId,
        userId: m.userId,
        joinedAt: m.joinedAt.toISOString(),
        lastReadMessageId: m.lastReadMessageId,
        lastReadAt: m.lastReadAt?.toISOString() ?? null,
        mutedAt: m.mutedAt?.toISOString() ?? null,
        archivedAt: m.archivedAt?.toISOString() ?? null,
        unreadCount: m.unreadCount,
        user: {
          id: m.user.id,
          phone: m.user.phone,
          role: m.user.role,
          displayName:
            m.user.workerProfile?.displayName ??
            m.user.employerProfile?.businessName ??
            m.user.phone,
          avatarUrl: m.user.workerProfile?.profilePhotoKey ?? null,
        },
      })),
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            conversationId: lastMsg.conversationId,
            senderId: lastMsg.senderId,
            clientMessageId: lastMsg.clientMessageId,
            sequenceNumber: lastMsg.sequenceNumber,
            messageType: lastMsg.messageType,
            body: lastMsg.body ?? lastMsg.content,
            content: lastMsg.body ?? lastMsg.content,
            attachmentKey: lastMsg.attachmentKey,
            replyToMessageId: lastMsg.replyToMessageId,
            createdAt: (lastMsg.createdAt ?? lastMsg.sentAt).toISOString(),
            sentAt: (lastMsg.createdAt ?? lastMsg.sentAt).toISOString(),
            editedAt: lastMsg.editedAt?.toISOString() ?? null,
            deletedAt: lastMsg.deletedAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}

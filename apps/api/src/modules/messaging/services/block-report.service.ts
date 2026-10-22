import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import { MESSAGING_ERROR_CODES } from '../messaging.constants';
import { DomainEventType } from '@localsaathi/types';

@Injectable()
export class BlockReportService {
  private readonly logger = new Logger(BlockReportService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Blocks a user.
   */
  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException({
        code: MESSAGING_ERROR_CODES.CANNOT_MESSAGE_SELF,
        message: 'You cannot block yourself.',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: blockedId },
    });
    if (!targetUser) {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.RECIPIENT_NOT_FOUND,
        message: 'User to block does not exist.',
      });
    }

    const blocked = await this.prisma.$transaction(async (tx) => {
      const record = await tx.blockedUser.upsert({
        where: {
          blockerId_blockedId: { blockerId, blockedId },
        },
        create: {
          blockerId,
          blockedId,
          reason,
        },
        update: {
          reason,
        },
      });

      // Outbox and DomainEvent creation
      await tx.domainEvent.create({
        data: {
          type: DomainEventType.USER_BLOCKED,
          actorId: blockerId,
          entityType: 'User',
          entityId: blockedId,
          payload: { blockerId, blockedId, reason },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.USER_BLOCKED,
          aggregateType: 'User',
          aggregateId: blockedId,
          actorId: blockerId,
          payload: { blockerId, blockedId, reason },
        },
      });

      return record;
    });

    this.logger.log(`User ${blockerId} blocked user ${blockedId}`);
    return {
      id: blocked.id,
      blockerId: blocked.blockerId,
      blockedId: blocked.blockedId,
      reason: blocked.reason,
      createdAt: blocked.createdAt.toISOString(),
    };
  }

  /**
   * Unblocks a user.
   */
  async unblockUser(blockerId: string, blockedId: string) {
    const existing = await this.prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (!existing) {
      return { success: true, message: 'User was not blocked.' };
    }

    await this.prisma.blockedUser.delete({
      where: { id: existing.id },
    });

    this.logger.log(`User ${blockerId} unblocked user ${blockedId}`);
    return { success: true, message: 'User unblocked successfully.' };
  }

  /**
   * Returns list of blocked users for the authenticated user.
   */
  async getBlockedUsers(userId: string) {
    const blocked = await this.prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            phone: true,
            role: true,
            workerProfile: { select: { displayName: true } },
            employerProfile: { select: { businessName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return blocked.map((b) => ({
      id: b.id,
      blockedId: b.blockedId,
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
      user: {
        id: b.blocked.id,
        role: b.blocked.role,
        displayName:
          b.blocked.workerProfile?.displayName ??
          b.blocked.employerProfile?.businessName ??
          b.blocked.phone,
      },
    }));
  }

  /**
   * Checks if either user has blocked the other.
   */
  async isBlocked(userA: string, userB: string): Promise<boolean> {
    const block = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA },
        ],
      },
    });

    return !!block;
  }

  /**
   * Reports a message.
   */
  async reportMessage(
    reporterId: string,
    messageId: string,
    reason: string,
    details?: string,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        code: MESSAGING_ERROR_CODES.MESSAGE_NOT_FOUND,
        message: 'Message to report not found.',
      });
    }

    const members = message.conversation?.members ?? [];
    const isMember = members.some(
      (m) => m.userId === reporterId,
    );
    if (!isMember) {
      throw new ForbiddenException({
        code: MESSAGING_ERROR_CODES.CONVERSATION_ACCESS_DENIED,
        message: 'You can only report messages in conversations you belong to.',
      });
    }

    const report = await this.prisma.reportedMessage.create({
      data: {
        reporterId,
        messageId,
        conversationId: message.conversationId,
        reason,
        details,
        status: 'PENDING',
      },
    });

    // Also register in platform-wide Report model for unified admin review
    try {
      await this.prisma.report.create({
        data: {
          reporterId,
          targetType: 'MESSAGE',
          targetId: messageId,
          reason: `${reason}: ${details ?? 'No details provided'}`,
          status: 'PENDING',
        },
      });
    } catch {
      // Ignored if report table write fails
    }

    this.logger.log(`Message ${messageId} reported by user ${reporterId} (reason: ${reason})`);
    return {
      id: report.id,
      reporterId: report.reporterId,
      messageId: report.messageId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    };
  }
}

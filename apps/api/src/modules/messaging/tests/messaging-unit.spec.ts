import { Test, TestingModule } from '@nestjs/testing';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { BlockReportService } from '../services/block-report.service';
import { TypingService } from '../services/typing.service';
import { MessagingDispatcherService } from '../realtime/messaging-dispatcher.service';
import { PrismaService } from '../../database/database.module';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Messaging Unit Tests', () => {
  let conversationService: ConversationService;
  let messageService: MessageService;
  let blockReportService: BlockReportService;
  let typingService: TypingService;

  const mockPrisma: any = {
    conversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversationMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    messageAttachment: {
      create: jest.fn(),
    },
    messageReadReceipt: {
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    blockedUser: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    reportedMessage: {
      create: jest.fn(),
    },
    report: {
      create: jest.fn(),
    },
    jobApplication: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    jobPost: {
      findUnique: jest.fn(),
    },
    domainEvent: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockDispatcher: any = {
    broadcast: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        MessageService,
        BlockReportService,
        TypingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MessagingDispatcherService, useValue: mockDispatcher },
      ],
    }).compile();

    conversationService = module.get<ConversationService>(ConversationService);
    messageService = module.get<MessageService>(MessageService);
    blockReportService = module.get<BlockReportService>(BlockReportService);
    typingService = module.get<TypingService>(TypingService);
  });

  describe('ConversationService Authorization & IDOR', () => {
    it('assertMember throws ForbiddenException when user is not a member', async () => {
      mockPrisma.conversationMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        conversationService.assertMember('conv-1', 'user-intruder'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('assertMember returns member record when user is authorized', async () => {
      const member = { id: 'm-1', conversationId: 'conv-1', userId: 'user-1' };
      mockPrisma.conversationMember.findUnique.mockResolvedValueOnce(member);

      const res = await conversationService.assertMember('conv-1', 'user-1');
      expect(res).toEqual(member);
    });

    it('createConversation throws BadRequestException when messaging self', async () => {
      await expect(
        conversationService.createConversation('user-1', {
          recipientUserId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('createConversation throws ForbiddenException when communication is blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-2',
        accountStatus: 'ACTIVE',
      });
      mockPrisma.blockedUser.findFirst.mockResolvedValueOnce({
        id: 'b-1',
        blockerId: 'user-2',
        blockedId: 'user-1',
      });

      await expect(
        conversationService.createConversation('user-1', {
          recipientUserId: 'user-2',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('MessageService Idempotency & Sequencing', () => {
    it('returns existing message on matching clientMessageId (idempotent send)', async () => {
      // Authorized member
      mockPrisma.conversationMember.findUnique.mockResolvedValue({
        id: 'm-1',
        conversationId: 'conv-1',
        userId: 'user-1',
      });
      // Conversation with members
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        members: [
          { userId: 'user-1', user: {} },
          { userId: 'user-2', user: {} },
        ],
      });
      // Not blocked
      mockPrisma.blockedUser.findFirst.mockResolvedValue(null);

      // Existing message found with same clientMessageId
      const existingMessage = {
        id: 'msg-existing',
        conversationId: 'conv-1',
        senderId: 'user-1',
        clientMessageId: 'client-key-123',
        sequenceNumber: 42,
        messageType: 'TEXT',
        body: 'Hello world',
        content: 'Hello world',
        createdAt: new Date(),
        attachments: [],
        readReceipts: [],
        reactions: [],
      };
      mockPrisma.message.findUnique.mockResolvedValueOnce(existingMessage);

      const res = await messageService.sendMessage('conv-1', 'user-1', {
        clientMessageId: 'client-key-123',
        body: 'Hello world',
      });

      expect(res.id).toBe('msg-existing');
      expect(res.sequenceNumber).toBe(42);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('assigns monotonic sequenceNumber on new message', async () => {
      mockPrisma.conversationMember.findUnique.mockResolvedValue({
        id: 'm-1',
        conversationId: 'conv-1',
        userId: 'user-1',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        members: [
          { userId: 'user-1', user: {} },
          { userId: 'user-2', user: {} },
        ],
      });
      mockPrisma.blockedUser.findFirst.mockResolvedValue(null);
      // No existing idempotent message
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);
      // Previous highest sequence number is 5
      mockPrisma.message.findFirst.mockResolvedValueOnce({ sequenceNumber: 5 });

      const createdMsg = {
        id: 'msg-new',
        conversationId: 'conv-1',
        senderId: 'user-1',
        clientMessageId: 'client-key-new',
        sequenceNumber: 6,
        messageType: 'TEXT',
        body: 'Next message',
        content: 'Next message',
        createdAt: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(createdMsg);

      // getMessageEntity returns full msg
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        ...createdMsg,
        attachments: [],
        readReceipts: [],
        reactions: [],
      });

      const res = await messageService.sendMessage('conv-1', 'user-1', {
        clientMessageId: 'client-key-new',
        body: 'Next message',
      });

      expect(res.sequenceNumber).toBe(6);
      expect(mockDispatcher.broadcast).toHaveBeenCalled();
    });

    it('rejects editing messages by non-authors', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        senderId: 'user-original-author',
        deletedAt: null,
      });

      await expect(
        messageService.updateMessage('msg-1', 'user-intruder', {
          body: 'Malicious edit',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('soft deletes message and updates text to Message deleted', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        sequenceNumber: 1,
        messageType: 'TEXT',
      });
      mockPrisma.message.update.mockResolvedValueOnce({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        sequenceNumber: 1,
        messageType: 'TEXT',
        body: 'Message deleted',
        content: 'Message deleted',
        deletedAt: new Date(),
        createdAt: new Date(),
      });

      const res = await messageService.deleteMessage('msg-1', 'user-1');
      expect(res.deleted).toBe(true);
      expect(mockDispatcher.broadcast).toHaveBeenCalled();
    });
  });

  describe('BlockReportService', () => {
    it('prevents user from blocking themselves', async () => {
      await expect(
        blockReportService.blockUser('user-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows blocking an existing user and creates outbox event', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-2' });
      mockPrisma.blockedUser.upsert.mockResolvedValueOnce({
        id: 'block-1',
        blockerId: 'user-1',
        blockedId: 'user-2',
        reason: 'Spam',
        createdAt: new Date(),
      });

      const res = await blockReportService.blockUser('user-1', 'user-2', 'Spam');
      expect(res.blockedId).toBe('user-2');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });

    it('reports a message in a conversation the user belongs to', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        conversationId: 'conv-1',
        conversation: {
          members: [{ userId: 'user-reporter' }],
        },
      });
      mockPrisma.reportedMessage.create.mockResolvedValueOnce({
        id: 'rep-1',
        reporterId: 'user-reporter',
        messageId: 'msg-1',
        reason: 'HARASSMENT',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const res = await blockReportService.reportMessage(
        'user-reporter',
        'msg-1',
        'HARASSMENT',
        'Offensive language',
      );
      expect(res.status).toBe('PENDING');
      expect(mockPrisma.report.create).toHaveBeenCalled();
    });
  });

  describe('TypingService', () => {
    it('debounces rapid typing events', async () => {
      const first = await typingService.setTyping('conv-1', 'user-1', true);
      expect(first).toBe(true);

      const immediateSecond = await typingService.setTyping('conv-1', 'user-1', true);
      expect(immediateSecond).toBe(false);

      const stopped = await typingService.setTyping('conv-1', 'user-1', false);
      expect(stopped).toBe(true);
    });
  });
});

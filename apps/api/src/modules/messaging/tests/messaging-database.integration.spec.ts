import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { BlockReportService } from '../services/block-report.service';
import { MessagingDispatcherService } from '../realtime/messaging-dispatcher.service';
import { PrismaService } from '../../database/database.module';
import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

const shouldRunDbIntegrationTests =
  process.env.RUN_DB_INTEGRATION_TESTS === 'true' ||
  process.env.DATABASE_INTEGRATION_TESTS === 'true';

const integrationSuite = shouldRunDbIntegrationTests ? describe : describe.skip;

integrationSuite('Messaging Database Integration Tests (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let conversationService: ConversationService;
  let messageService: MessageService;
  let blockReportService: BlockReportService;

  let workerUserId: string;
  let employerUserId: string;
  let intruderUserId: string;
  let employerProfileId: string;
  let workerProfileId: string;
  let jobPostId: string;
  let testConversationId: string;

  const mockDispatcher = {
    broadcast: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
    await prisma.$connect();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        MessageService,
        BlockReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingDispatcherService, useValue: mockDispatcher },
      ],
    }).compile();

    conversationService = module.get<ConversationService>(ConversationService);
    messageService = module.get<MessageService>(MessageService);
    blockReportService = module.get<BlockReportService>(BlockReportService);

    // Seed test users with unique phones
    const timestamp = Date.now().toString().slice(-6);

    const workerUser = await prisma.user.create({
      data: {
        phone: `+919999${timestamp}1`,
        role: 'WORKER',
        accountStatus: 'ACTIVE',
      },
    });
    workerUserId = workerUser.id;

    const workerProfile = await prisma.workerProfile.create({
      data: {
        userId: workerUserId,
        displayName: 'Test Integration Worker',
      },
    });
    workerProfileId = workerProfile.id;

    const employerUser = await prisma.user.create({
      data: {
        phone: `+919999${timestamp}2`,
        role: 'EMPLOYER',
        accountStatus: 'ACTIVE',
      },
    });
    employerUserId = employerUser.id;

    const employerProfile = await prisma.employerProfile.create({
      data: {
        userId: employerUserId,
        businessName: 'Integration Enterprise',
        contactPreferences: ['IN_APP', 'PHONE'],
      },
    });
    employerProfileId = employerProfile.id;

    const intruderUser = await prisma.user.create({
      data: {
        phone: `+919999${timestamp}3`,
        role: 'WORKER',
        accountStatus: 'ACTIVE',
      },
    });
    intruderUserId = intruderUser.id;

    // Create a job post
    const jobPost = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Integration Plumber Job',
        description: 'Urgent plumbing work',
        category: 'Plumbing',
        wageAmount: 700,
        wageType: 'DAILY',
        startDate: new Date(),
      },
    });
    jobPostId = jobPost.id;
  }, 30000);

  afterAll(async () => {
    // Clean up created entities
    if (testConversationId) {
      await prisma.messageAttachment.deleteMany({
        where: { message: { conversationId: testConversationId } },
      }).catch(() => undefined);
      await prisma.messageReadReceipt.deleteMany({
        where: { message: { conversationId: testConversationId } },
      }).catch(() => undefined);
      await prisma.message.deleteMany({
        where: { conversationId: testConversationId },
      }).catch(() => undefined);
      await prisma.conversationMember.deleteMany({
        where: { conversationId: testConversationId },
      }).catch(() => undefined);
      await prisma.conversation.delete({
        where: { id: testConversationId },
      }).catch(() => undefined);
    }

    if (jobPostId) {
      await prisma.jobPost.delete({ where: { id: jobPostId } }).catch(() => undefined);
    }
    if (employerProfileId) {
      await prisma.employerProfile.delete({ where: { id: employerProfileId } }).catch(() => undefined);
    }
    if (workerProfileId) {
      await prisma.workerProfile.delete({ where: { id: workerProfileId } }).catch(() => undefined);
    }
    if (workerUserId) {
      await prisma.user.delete({ where: { id: workerUserId } }).catch(() => undefined);
    }
    if (employerUserId) {
      await prisma.user.delete({ where: { id: employerUserId } }).catch(() => undefined);
    }
    if (intruderUserId) {
      await prisma.user.delete({ where: { id: intruderUserId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
  }, 30000);

  it('1. should create an authorized conversation between worker and employer', async () => {
    const conv = await conversationService.createConversation(workerUserId, {
      recipientUserId: employerUserId,
      jobPostId,
      initialMessage: 'Hello employer, I am interested in your plumbing job!',
    });

    expect(conv.id).toBeDefined();
    expect(conv.members.length).toBe(2);
    expect(conv.lastMessage).toBeDefined();
    expect(conv.lastMessage?.body).toBe('Hello employer, I am interested in your plumbing job!');
    testConversationId = conv.id;

    // Verify in real database
    const dbConv = await prisma.conversation.findUnique({
      where: { id: conv.id },
      include: { members: true, messages: true },
    });
    expect(dbConv).not.toBeNull();
    expect(dbConv?.members.length).toBe(2);
    expect(dbConv?.messages.length).toBe(1);
    expect(dbConv?.messages[0]?.sequenceNumber).toBe(1);
  });

  it('2. should enforce strict IDOR: intruder cannot access conversation', async () => {
    await expect(
      conversationService.getConversation(testConversationId, intruderUserId),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      messageService.sendMessage(testConversationId, intruderUserId, {
        clientMessageId: randomUUID(),
        body: 'Unauthorized spy message',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. should guarantee idempotent message sending without duplicate DB rows', async () => {
    const clientKey = `idempotent-key-${Date.now()}`;

    // First send
    const msg1 = await messageService.sendMessage(testConversationId, employerUserId, {
      clientMessageId: clientKey,
      body: 'Can you start on Monday?',
    });

    expect(msg1.id).toBeDefined();
    expect(msg1.sequenceNumber).toBe(2);

    // Second send with same clientMessageId (e.g. mobile network retry)
    const msg2 = await messageService.sendMessage(testConversationId, employerUserId, {
      clientMessageId: clientKey,
      body: 'Can you start on Monday?',
    });

    expect(msg2.id).toBe(msg1.id);
    expect(msg2.sequenceNumber).toBe(msg1.sequenceNumber);

    // Verify database row count
    const rows = await prisma.message.findMany({
      where: { conversationId: testConversationId, clientMessageId: clientKey },
    });
    expect(rows.length).toBe(1);
  });

  it('4. should assign strictly monotonic sequence numbers to consecutive messages', async () => {
    const msgA = await messageService.sendMessage(testConversationId, workerUserId, {
      clientMessageId: randomUUID(),
      body: 'Yes, Monday 9 AM works.',
    });

    const msgB = await messageService.sendMessage(testConversationId, employerUserId, {
      clientMessageId: randomUUID(),
      body: 'Great, see you then.',
    });

    expect(msgA.sequenceNumber).toBe(3);
    expect(msgB.sequenceNumber).toBe(4);
  });

  it('5. should mark conversation as read and reset unreadCount', async () => {
    // Check employer member unread count before read
    const memberBefore = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: testConversationId,
          userId: employerUserId,
        },
      },
    });
    expect(memberBefore?.unreadCount).toBeGreaterThan(0);

    // Employer marks as read
    const readRes = await messageService.markAsRead(testConversationId, employerUserId);
    expect(readRes.conversationId).toBe(testConversationId);

    // Verify member unread count is now 0 in database
    const memberAfter = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: testConversationId,
          userId: employerUserId,
        },
      },
    });
    expect(memberAfter?.unreadCount).toBe(0);
    expect(memberAfter?.lastReadAt).not.toBeNull();
  });

  it('6. should soft delete a message and mask content as "Message deleted"', async () => {
    const msgToDelete = await messageService.sendMessage(testConversationId, workerUserId, {
      clientMessageId: randomUUID(),
      body: 'Oops, wrong message',
    });

    const deleteRes = await messageService.deleteMessage(msgToDelete.id, workerUserId);
    expect(deleteRes.deleted).toBe(true);

    // Check message in database: soft-deleted
    const dbMsg = await prisma.message.findUnique({
      where: { id: msgToDelete.id },
    });
    expect(dbMsg?.deletedAt).not.toBeNull();
    expect(dbMsg?.body).toBe('Message deleted');
  });

  it('7. should block communication and prevent new messages between blocked users', async () => {
    // Employer blocks worker
    await blockReportService.blockUser(employerUserId, workerUserId, 'Contract dispute');

    // Worker attempts to send message to the conversation
    await expect(
      messageService.sendMessage(testConversationId, workerUserId, {
        clientMessageId: randomUUID(),
        body: 'Are you there?',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Clean up block
    await blockReportService.unblockUser(employerUserId, workerUserId);
  });
});

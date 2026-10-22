import { Test, TestingModule } from '@nestjs/testing';
import { ConversationController } from '../controllers/conversation.controller';
import { MessageController } from '../controllers/message.controller';
import { UserBlockController } from '../controllers/user-block.controller';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { BlockReportService } from '../services/block-report.service';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, UserRole } from '@localsaathi/types';

describe('Messaging API Controller Tests', () => {
  let convController: ConversationController;
  let msgController: MessageController;
  let blockController: UserBlockController;

  const mockConversationService = {
    createConversation: jest.fn(),
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    getGlobalUnreadCount: jest.fn(),
    muteConversation: jest.fn(),
    archiveConversation: jest.fn(),
  };

  const mockMessageService = {
    sendMessage: jest.fn(),
    listMessages: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
    markAsRead: jest.fn(),
  };

  const mockBlockReportService = {
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    getBlockedUsers: jest.fn(),
    reportMessage: jest.fn(),
  };

  const mockUser: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    role: UserRole.WORKER,
    sessionId: 'session-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        ConversationController,
        MessageController,
        UserBlockController,
      ],
      providers: [
        { provide: ConversationService, useValue: mockConversationService },
        { provide: MessageService, useValue: mockMessageService },
        { provide: BlockReportService, useValue: mockBlockReportService },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    convController = module.get<ConversationController>(ConversationController);
    msgController = module.get<MessageController>(MessageController);
    blockController = module.get<UserBlockController>(UserBlockController);
  });

  it('POST /conversations creates a conversation', async () => {
    const input = {
      recipientUserId: '22222222-2222-2222-2222-222222222222',
      initialMessage: 'Hi',
    };
    mockConversationService.createConversation.mockResolvedValueOnce({
      id: 'conv-1',
      type: 'DIRECT',
    });

    const res = await convController.createConversation(mockUser, input);
    expect(res.id).toBe('conv-1');
    expect(mockConversationService.createConversation).toHaveBeenCalledWith(
      mockUser.userId,
      expect.objectContaining({ recipientUserId: input.recipientUserId }),
    );
  });

  it('GET /conversations lists conversations', async () => {
    mockConversationService.listConversations.mockResolvedValueOnce({
      conversations: [],
      nextCursor: null,
      hasMore: false,
    });

    const res = await convController.listConversations(mockUser, { limit: 10 });
    expect(res.conversations).toBeDefined();
    expect(mockConversationService.listConversations).toHaveBeenCalled();
  });

  it('GET /conversations/unread-count returns unread count', async () => {
    mockConversationService.getGlobalUnreadCount.mockResolvedValueOnce({
      unreadCount: 3,
    });

    const res = await convController.getGlobalUnreadCount(mockUser);
    expect(res.unreadCount).toBe(3);
  });

  it('GET /conversations/:id returns conversation details', async () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    mockConversationService.getConversation.mockResolvedValueOnce({
      id: convId,
    });

    const res = await convController.getConversation(mockUser, convId);
    expect(res.id).toBe(convId);
    expect(mockConversationService.getConversation).toHaveBeenCalledWith(
      convId,
      mockUser.userId,
    );
  });

  it('GET /conversations/:id/messages lists messages', async () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    mockMessageService.listMessages.mockResolvedValueOnce({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const res = await convController.listMessages(mockUser, convId, { limit: 20 });
    expect(res.messages).toBeDefined();
    expect(mockMessageService.listMessages).toHaveBeenCalled();
  });

  it('POST /conversations/:id/messages sends a message', async () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    const body = {
      clientMessageId: 'client-key-1',
      body: 'Hello',
    };
    mockMessageService.sendMessage.mockResolvedValueOnce({
      id: 'msg-1',
      body: 'Hello',
    });

    const res = await convController.sendMessage(mockUser, convId, body);
    expect(res.id).toBe('msg-1');
    expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
      convId,
      mockUser.userId,
      expect.objectContaining({ body: 'Hello' }),
    );
  });

  it('POST /conversations/:id/read records read receipt', async () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    mockMessageService.markAsRead.mockResolvedValueOnce({
      conversationId: convId,
      userId: mockUser.userId,
    });

    const res = await convController.markAsRead(mockUser, convId, {});
    expect(res.conversationId).toBe(convId);
  });

  it('POST /conversations/:id/mute updates mute state', async () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    mockConversationService.muteConversation.mockResolvedValueOnce({
      conversationId: convId,
      isMuted: true,
    });

    const res = await convController.muteConversation(mockUser, convId, { mute: true });
    expect(res.isMuted).toBe(true);
  });

  it('POST /conversations/:id/archive updates archive state', async () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    mockConversationService.archiveConversation.mockResolvedValueOnce({
      conversationId: convId,
      isArchived: true,
    });

    const res = await convController.archiveConversation(mockUser, convId, { archive: true });
    expect(res.isArchived).toBe(true);
  });

  it('PATCH /messages/:id edits a message', async () => {
    const msgId = '44444444-4444-4444-4444-444444444444';
    mockMessageService.updateMessage.mockResolvedValueOnce({
      id: msgId,
      body: 'Edited content',
    });

    const res = await msgController.updateMessage(mockUser, msgId, {
      body: 'Edited content',
    });
    expect(res.body).toBe('Edited content');
  });

  it('DELETE /messages/:id soft deletes a message', async () => {
    const msgId = '44444444-4444-4444-4444-444444444444';
    mockMessageService.deleteMessage.mockResolvedValueOnce({
      id: msgId,
      deleted: true,
    });

    const res = await msgController.deleteMessage(mockUser, msgId);
    expect(res.deleted).toBe(true);
  });

  it('POST /messages/:id/report reports a message', async () => {
    const msgId = '44444444-4444-4444-4444-444444444444';
    mockBlockReportService.reportMessage.mockResolvedValueOnce({
      id: 'rep-1',
      status: 'PENDING',
    });

    const res = await msgController.reportMessage(mockUser, msgId, {
      reason: 'SPAM',
      details: 'Advertising links',
    });
    expect(res.status).toBe('PENDING');
  });

  it('POST /users/:id/block blocks a user', async () => {
    const targetUserId = '55555555-5555-5555-5555-555555555555';
    mockBlockReportService.blockUser.mockResolvedValueOnce({
      blockedId: targetUserId,
    });

    const res = await blockController.blockUser(mockUser, targetUserId, {
      reason: 'Harassment',
    });
    expect(res.blockedId).toBe(targetUserId);
  });

  it('DELETE /users/:id/block unblocks a user', async () => {
    const targetUserId = '55555555-5555-5555-5555-555555555555';
    mockBlockReportService.unblockUser.mockResolvedValueOnce({
      success: true,
    });

    const res = await blockController.unblockUser(mockUser, targetUserId);
    expect(res.success).toBe(true);
  });

  it('GET /users/blocked returns blocked users list', async () => {
    mockBlockReportService.getBlockedUsers.mockResolvedValueOnce([]);

    const res = await blockController.getBlockedUsers(mockUser);
    expect(Array.isArray(res)).toBe(true);
  });
});

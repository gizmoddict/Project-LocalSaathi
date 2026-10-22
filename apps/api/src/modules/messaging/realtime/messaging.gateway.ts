import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../../auth/services/token.service';
import { AuthenticatedUser } from '@localsaathi/types';
import { MESSAGING_CONSTANTS, WS_MESSAGING_EVENTS } from '../messaging.constants';
import { PrismaService } from '../../database/database.module';
import { PresenceService } from '../services/presence.service';
import { TypingService } from '../services/typing.service';

const isAllowedWsOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  const allowed = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  if (allowed.includes(origin)) return true;
  if (
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return true;
  }
  return false;
};

@WebSocketGateway({
  namespace: MESSAGING_CONSTANTS.WS_MESSAGING_NAMESPACE,
  cors: {
    origin: (origin, callback) => {
      if (isAllowedWsOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by WebSocket CORS policy'), false);
      }
    },
    credentials: true,
  },
})
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
    private readonly typingService: TypingService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log(
      `MessagingGateway initialized on namespace ${MESSAGING_CONSTANTS.WS_MESSAGING_NAMESPACE}`,
    );
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(
          `Messaging connection rejected: missing token (socketId=${client.id})`,
        );
        client.emit('error', { message: 'Missing authentication token' });
        client.disconnect(true);
        return;
      }

      const user: AuthenticatedUser = await this.tokenService.verifyAccessToken(token);

      // Verify user exists and is active in database
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true, accountStatus: true },
      });

      if (!dbUser || dbUser.accountStatus !== 'ACTIVE') {
        this.logger.warn(
          `Messaging connection rejected: user suspended or not found (${user.userId})`,
        );
        client.emit('error', { message: 'Account suspended or inactive' });
        client.disconnect(true);
        return;
      }

      client.data.user = user;

      // Automatically join user's private channel
      const userRoom = `user:${user.userId}`;
      await client.join(userRoom);

      if (!this.connectedUsers.has(user.userId)) {
        this.connectedUsers.set(user.userId, new Set());
      }
      this.connectedUsers.get(user.userId)!.add(client.id);

      // Register presence
      const becameOnline = await this.presenceService.userOnline(user.userId, client.id);

      this.logger.log(
        `Messaging socket connected: userId=${user.userId}, socketId=${client.id}`,
      );

      client.emit('connected', {
        userId: user.userId,
        timestamp: new Date().toISOString(),
      });

      if (becameOnline) {
        this.broadcastPresenceChange(user.userId, 'ONLINE');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Messaging connection failed (${client.id}): ${msg}`);
      client.emit('error', { message: 'Invalid or expired authentication token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user: AuthenticatedUser | undefined = client.data.user;

    if (user?.userId) {
      if (this.connectedUsers.has(user.userId)) {
        const set = this.connectedUsers.get(user.userId)!;
        set.delete(client.id);
        if (set.size === 0) {
          this.connectedUsers.delete(user.userId);
        }
      }

      const becameOffline = await this.presenceService.userOffline(user.userId, client.id);
      if (becameOffline) {
        this.broadcastPresenceChange(user.userId, 'OFFLINE');
      }
    }

    this.logger.log(`Messaging socket disconnected: socketId=${client.id}`);
  }

  /**
   * Server-validated room join.
   * Client sends { conversationId: string }.
   * Server MUST verify membership before allowing socket to join the conversation room.
   */
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId?: string },
  ) {
    const user: AuthenticatedUser | undefined = client.data.user;
    if (!user?.userId) {
      return { status: 'unauthorized', error: 'Authentication required' };
    }

    const conversationId = data?.conversationId;
    if (!conversationId) {
      return { status: 'bad_request', error: 'Missing conversationId' };
    }

    // Strict membership check against DB
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: user.userId,
        },
      },
    });

    if (!member) {
      this.logger.warn(
        `Unauthorized room join attempt: user=${user.userId} attempted to join conversation=${conversationId}`,
      );
      return {
        status: 'forbidden',
        error: 'You are not a member of this conversation',
      };
    }

    const roomName = `conversation:${conversationId}`;
    await client.join(roomName);

    this.logger.debug(
      `User ${user.userId} joined room ${roomName} on socket ${client.id}`,
    );

    return {
      status: 'joined',
      conversationId,
      timestamp: new Date().toISOString(),
    };
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId?: string },
  ) {
    const conversationId = data?.conversationId;
    if (conversationId) {
      await client.leave(`conversation:${conversationId}`);
    }
    return { status: 'left', conversationId };
  }

  /**
   * Throttled typing indicator.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const user: AuthenticatedUser | undefined = client.data.user;
    if (!user?.userId || !data?.conversationId) return;

    // Verify membership
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: data.conversationId,
          userId: user.userId,
        },
      },
      select: { id: true },
    });
    if (!member) return;

    const shouldBroadcast = await this.typingService.setTyping(
      data.conversationId,
      user.userId,
      !!data.isTyping,
    );

    if (shouldBroadcast) {
      const roomName = `conversation:${data.conversationId}`;
      const eventName = data.isTyping
        ? WS_MESSAGING_EVENTS.TYPING_STARTED
        : WS_MESSAGING_EVENTS.TYPING_STOPPED;

      const typingPayload = {
        conversationId: data.conversationId,
        userId: user.userId,
        isTyping: !!data.isTyping,
        timestamp: new Date().toISOString(),
      };

      client.to(roomName).emit(eventName, typingPayload);
      client.to(roomName).emit('typing.status', typingPayload);
    }
  }

  /**
   * Heartbeat to maintain online status.
   */
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const user: AuthenticatedUser | undefined = client.data.user;
    if (user?.userId) {
      await this.presenceService.heartbeat(user.userId);
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Dispatches event to a conversation room.
   */
  sendToConversation(
    conversationId: string,
    eventName: string,
    payload: any,
  ): void {
    const roomName = `conversation:${conversationId}`;
    this.server.to(roomName).emit(eventName, payload);
    if (eventName === WS_MESSAGING_EVENTS.MESSAGE_CREATED) {
      this.server.to(roomName).emit('message.new', payload?.message ?? payload);
    }
    if (eventName === WS_MESSAGING_EVENTS.MESSAGE_READ) {
      this.server.to(roomName).emit('receipt.read', payload?.readReceipt ?? payload);
    }
    this.logger.debug(`Emitted '${eventName}' to room '${roomName}'`);
  }

  /**
   * Dispatches event to a specific user's private room across all their connected devices.
   */
  sendToUser(userId: string, eventName: string, payload: any): boolean {
    const roomName = `user:${userId}`;
    this.server.to(roomName).emit(eventName, payload);
    if (eventName === WS_MESSAGING_EVENTS.MESSAGE_CREATED) {
      this.server.to(roomName).emit('message.new', payload?.message ?? payload);
    }
    if (eventName === WS_MESSAGING_EVENTS.MESSAGE_READ) {
      this.server.to(roomName).emit('receipt.read', payload?.readReceipt ?? payload);
    }
    const activeSockets = this.connectedUsers.get(userId)?.size ?? 0;
    this.logger.debug(
      `Emitted '${eventName}' to user room '${roomName}' (activeSockets=${activeSockets})`,
    );
    return activeSockets > 0;
  }

  /**
   * Broadcasts presence change to user's conversation partners.
   */
  private async broadcastPresenceChange(
    userId: string,
    status: 'ONLINE' | 'OFFLINE',
  ) {
    try {
      // Find all conversations where this user is a member
      const userMemberships = await this.prisma.conversationMember.findMany({
        where: { userId },
        select: { conversationId: true },
      });

      for (const m of userMemberships) {
        this.server.to(`conversation:${m.conversationId}`).emit(
          WS_MESSAGING_EVENTS.PRESENCE_UPDATED,
          {
            userId,
            status,
            timestamp: new Date().toISOString(),
          },
        );
      }
    } catch (err) {
      this.logger.debug(`Failed to broadcast presence update: ${err}`);
    }
  }

  getMetrics() {
    let totalSockets = 0;
    for (const sockets of this.connectedUsers.values()) {
      totalSockets += sockets.size;
    }
    return {
      activeUsers: this.connectedUsers.size,
      activeSockets: totalSockets,
    };
  }

  private extractToken(client: Socket): string | null {
    if (client.handshake.auth?.token) {
      return String(client.handshake.auth.token).replace(/^Bearer\s+/i, '');
    }
    if (client.handshake.query?.token) {
      return String(client.handshake.query.token).replace(/^Bearer\s+/i, '');
    }
    const authHeader = client.handshake.headers.authorization;
    if (authHeader) {
      return authHeader.replace(/^Bearer\s+/i, '');
    }
    return null;
  }
}

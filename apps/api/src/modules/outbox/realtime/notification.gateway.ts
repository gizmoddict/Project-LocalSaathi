import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../../auth/services/token.service';
import { AuthenticatedUser } from '@localsaathi/types';
import { OUTBOX_CONSTANTS } from '../outbox.constants';

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
  namespace: OUTBOX_CONSTANTS.WS_NOTIFICATION_NAMESPACE,
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
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(private readonly tokenService: TokenService) {}

  afterInit(_server: Server) {
    this.logger.log(`NotificationGateway initialized on namespace ${OUTBOX_CONSTANTS.WS_NOTIFICATION_NAMESPACE}`);
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Connection rejected: missing authentication token (socketId=${client.id})`);
        client.emit('error', { message: 'Missing authentication token' });
        client.disconnect(true);
        return;
      }

      const user: AuthenticatedUser = await this.tokenService.verifyAccessToken(token);
      client.data.user = user;

      const roomName = `user:${user.userId}`;
      await client.join(roomName);

      if (!this.connectedUsers.has(user.userId)) {
        this.connectedUsers.set(user.userId, new Set());
      }
      this.connectedUsers.get(user.userId)!.add(client.id);

      this.logger.log(
        `WebSocket client connected: userId=${user.userId}, role=${user.role}, socketId=${client.id}, room=${roomName}`,
      );

      client.emit('connected', {
        userId: user.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Connection authentication failed (socketId=${client.id}): ${msg}`);
      client.emit('error', { message: 'Invalid or expired authentication token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user: AuthenticatedUser | undefined = client.data.user;

    if (user?.userId && this.connectedUsers.has(user.userId)) {
      const userSockets = this.connectedUsers.get(user.userId)!;
      userSockets.delete(client.id);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(user.userId);
      }
    }

    this.logger.log(`WebSocket client disconnected: socketId=${client.id}`);
  }

  /**
   * Pushes a real-time event to a specific user's private channel.
   * Returns true if user has active connections on this node.
   */
  sendToUser(userId: string, eventName: string, payload: any): boolean {
    const roomName = `user:${userId}`;
    this.server.to(roomName).emit(eventName, payload);

    const activeSockets = this.connectedUsers.get(userId)?.size ?? 0;
    this.logger.debug(
      `Dispatched real-time event '${eventName}' to room '${roomName}' (activeSockets=${activeSockets})`,
    );

    return activeSockets > 0;
  }

  /**
   * Metrics and telemetry: returns number of active connected users and sockets.
   */
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

  /**
   * Ping/heartbeat responder.
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() _client: Socket) {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  private extractToken(client: Socket): string | null {
    // 1. Auth payload (standard Socket.IO client: io({ auth: { token } }))
    if (client.handshake.auth?.token) {
      return String(client.handshake.auth.token).replace(/^Bearer\s+/i, '');
    }

    // 2. Query param (e.g. ?token=...)
    if (client.handshake.query?.token) {
      return String(client.handshake.query.token).replace(/^Bearer\s+/i, '');
    }

    // 3. Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader) {
      return authHeader.replace(/^Bearer\s+/i, '');
    }

    return null;
  }
}

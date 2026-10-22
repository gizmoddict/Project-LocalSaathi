import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import {
  createConversationSchema,
  sendMessageSchema,
  conversationListQuerySchema,
  messageListQuerySchema,
} from '@localsaathi/validation';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or retrieve a direct conversation' })
  @ApiResponse({ status: 201, description: 'Conversation created or retrieved' })
  async createConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const input = createConversationSchema.parse(body);
    return this.conversationService.createConversation(user.userId, input);
  }

  @Get()
  @ApiOperation({ summary: 'List conversations for the current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'archived', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Paginated conversations' })
  async listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: unknown,
  ) {
    const query = conversationListQuerySchema.parse(rawQuery);
    return this.conversationService.listConversations(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get global unread messages count across all conversations' })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async getGlobalUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationService.getGlobalUnreadCount(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation details by ID' })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'Conversation details' })
  async getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversationService.getConversation(id, user.userId);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get cursor-paginated messages in a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'direction', required: false, enum: ['before', 'after'] })
  @ApiResponse({ status: 200, description: 'Messages list' })
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() rawQuery: unknown,
  ) {
    const query = messageListQuerySchema.parse(rawQuery);
    return this.messageService.listMessages(id, user.userId, query);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message into a conversation (Idempotent)' })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiResponse({ status: 201, description: 'Message sent or retrieved idempotently' })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = sendMessageSchema.parse(body);
    return this.messageService.sendMessage(id, user.userId, input);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation as read up to latest message' })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'Read receipt recorded' })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { lastReadMessageId?: string },
  ) {
    return this.messageService.markAsRead(id, user.userId, body?.lastReadMessageId);
  }

  @Post(':id/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mute or unmute conversation notifications' })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'Conversation mute status updated' })
  async muteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { mute?: boolean },
  ) {
    return this.conversationService.muteConversation(id, user.userId, body?.mute ?? true);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive or unarchive conversation' })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'Conversation archive status updated' })
  async archiveConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { archive?: boolean },
  ) {
    return this.conversationService.archiveConversation(id, user.userId, body?.archive ?? true);
  }
}

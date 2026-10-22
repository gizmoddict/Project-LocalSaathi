import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
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
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import {
  notificationQuerySchema,
  updateNotificationPreferenceSchema,
} from '@localsaathi/validation';

class NotificationQueryDto {
  page?: number;
  limit?: number;
  unreadOnly?: string;
  type?: string;
  cursor?: string;
}

class UpdatePreferenceDto {
  applicationUpdates?: boolean;
  bookingUpdates?: boolean;
  jobUpdates?: boolean;
  messageUpdates?: boolean;
  systemUpdates?: boolean;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of notifications for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unreadOnly', required: false, type: String, enum: ['true', 'false'] })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Notifications list with unread count' })
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: NotificationQueryDto,
  ) {
    const query = notificationQuerySchema.parse(rawQuery);
    return this.notificationService.getNotifications(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get count of unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.getUnreadCount(user.userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  @ApiResponse({ status: 200, description: 'Notification preferences' })
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.getPreferences(user.userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Updated notification preferences' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdatePreferenceDto,
  ) {
    const input = updateNotificationPreferenceSchema.parse(body);
    return this.notificationService.updatePreferences(user.userId, input);
  }

  @Get(':notificationId')
  @ApiOperation({ summary: 'Get a single notification by ID' })
  @ApiParam({ name: 'notificationId', type: 'string', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getNotificationById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.getNotificationById(user.userId, notificationId);
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Mark a notification as read (PATCH)' })
  @ApiParam({ name: 'notificationId', type: 'string', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.markAsRead(user.userId, notificationId);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read (POST alias)' })
  @ApiParam({ name: 'notificationId', type: 'string', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async markAsReadPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.markAsRead(user.userId, notificationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.markAllRead(user.userId);
  }

  @Delete(':notificationId')
  @ApiOperation({ summary: 'Delete a notification by ID' })
  @ApiParam({ name: 'notificationId', type: 'string', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async deleteNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.deleteNotification(user.userId, notificationId);
  }

  @Post('cleanup-expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete expired notifications' })
  @ApiResponse({ status: 200, description: 'Expired notifications cleaned' })
  async cleanExpired() {
    return this.notificationService.cleanExpiredNotifications();
  }
}

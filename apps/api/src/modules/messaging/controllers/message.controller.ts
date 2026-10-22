import {
  Controller,
  Patch,
  Delete,
  Post,
  Param,
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
} from '@nestjs/swagger';
import { MessageService } from '../services/message.service';
import { BlockReportService } from '../services/block-report.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import {
  updateMessageSchema,
  reportMessageSchema,
} from '@localsaathi/validation';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly blockReportService: BlockReportService,
  ) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a message sent by current user' })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: 'Message updated' })
  async updateMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = updateMessageSchema.parse(body);
    return this.messageService.updateMessage(id, user.userId, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a message sent by current user' })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: 'Message soft deleted' })
  async deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messageService.deleteMessage(id, user.userId);
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a message for moderation' })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: 'Report filed' })
  async reportMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = reportMessageSchema.parse(body);
    return this.blockReportService.reportMessage(
      user.userId,
      id,
      input.reason,
      input.details,
    );
  }
}

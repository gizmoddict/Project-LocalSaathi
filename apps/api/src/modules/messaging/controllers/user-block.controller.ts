import {
  Controller,
  Get,
  Post,
  Delete,
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
import { BlockReportService } from '../services/block-report.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import { blockUserSchema } from '@localsaathi/validation';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserBlockController {
  constructor(private readonly blockReportService: BlockReportService) {}

  @Get('blocked')
  @ApiOperation({ summary: 'List users blocked by current user' })
  @ApiResponse({ status: 200, description: 'List of blocked users' })
  async getBlockedUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.blockReportService.getBlockedUsers(user.userId);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user from sending messages or starting conversations' })
  @ApiParam({ name: 'id', description: 'User UUID to block' })
  @ApiResponse({ status: 200, description: 'User blocked' })
  async blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = blockUserSchema.parse(body || {});
    return this.blockReportService.blockUser(user.userId, id, input.reason);
  }

  @Delete(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a previously blocked user' })
  @ApiParam({ name: 'id', description: 'User UUID to unblock' })
  @ApiResponse({ status: 200, description: 'User unblocked' })
  async unblockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.blockReportService.unblockUser(user.userId, id);
  }
}

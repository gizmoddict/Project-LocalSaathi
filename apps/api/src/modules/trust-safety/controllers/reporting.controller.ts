import {
  Controller,
  Post,
  Get,
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
import { ReportingService } from '../services/reporting.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import { createReportSchema } from '@localsaathi/validation';

@ApiTags('Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserReportController {
  constructor(private readonly reportingService: ReportingService) {}

  @Post(':id/reports')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a user for safety/policy violation' })
  @ApiParam({ name: 'id', description: 'Target User UUID' })
  @ApiResponse({ status: 201, description: 'Report filed successfully' })
  async reportUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = createReportSchema.parse(body);
    return this.reportingService.reportUser(user.userId, id, input);
  }
}

@ApiTags('Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobReportController {
  constructor(private readonly reportingService: ReportingService) {}

  @Post(':id/reports')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a job post for fraudulent or unsafe terms' })
  @ApiParam({ name: 'id', description: 'Target Job UUID' })
  @ApiResponse({ status: 201, description: 'Report filed successfully' })
  async reportJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = createReportSchema.parse(body);
    return this.reportingService.reportJob(user.userId, id, input);
  }
}

@ApiTags('Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessageReportController {
  constructor(private readonly reportingService: ReportingService) {}

  @Post(':id/reports')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a chat message for harassment, spam, or unsafe content' })
  @ApiParam({ name: 'id', description: 'Target Message UUID' })
  @ApiResponse({ status: 201, description: 'Report filed successfully' })
  async reportMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = createReportSchema.parse(body);
    return this.reportingService.reportMessage(user.userId, id, input);
  }
}

@ApiTags('Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportListController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('mine')
  @ApiOperation({ summary: 'List safety reports filed by the current user' })
  @ApiResponse({ status: 200, description: 'List of reports filed by user' })
  async getMyReports(@CurrentUser() user: AuthenticatedUser) {
    return this.reportingService.getReportsByReporter(user.userId);
  }
}

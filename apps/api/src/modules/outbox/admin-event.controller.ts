import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, OutboxStatus } from '@localsaathi/types';
import { OutboxService } from './outbox.service';
import { OutboxProcessor } from './outbox.processor';
import { outboxQuerySchema } from '@localsaathi/validation';

@ApiTags('Admin Events & Outbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/events')
export class AdminEventController {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly outboxProcessor: OutboxProcessor,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get summary statistics of outbox events by status' })
  @ApiResponse({ status: 200, description: 'Event statistics' })
  async getStats() {
    return this.outboxService.getStats();
  }

  @Get('dead-letter')
  @ApiOperation({ summary: 'List dead-lettered events requiring operator intervention' })
  @ApiResponse({ status: 200, description: 'List of dead-lettered events' })
  async getDeadLetterEvents(@Query() rawQuery: any) {
    const query = outboxQuerySchema.parse({
      ...rawQuery,
      status: OutboxStatus.DEAD_LETTER,
    });
    return this.outboxService.getEvents(query);
  }

  @Get()
  @ApiOperation({ summary: 'List and search outbox events' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: OutboxStatus })
  @ApiQuery({ name: 'eventType', required: false, type: String })
  @ApiQuery({ name: 'aggregateType', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of outbox events' })
  async getEvents(@Query() rawQuery: any) {
    const query = outboxQuerySchema.parse(rawQuery);
    return this.outboxService.getEvents(query);
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get outbox event detail by ID with processing history' })
  @ApiParam({ name: 'eventId', type: 'string', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event details' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventById(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.outboxService.getEventById(eventId);
  }

  @Post(':eventId/retry')
  @ApiOperation({ summary: 'Requeue a failed or dead-lettered event for processing' })
  @ApiParam({ name: 'eventId', type: 'string', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event requeued' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async retryEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    const event = await this.outboxService.retryEvent(eventId);
    // Trigger immediate processor cycle
    this.outboxProcessor.triggerNow().catch(() => undefined);
    return event;
  }

  @Post(':eventId/discard')
  @ApiOperation({ summary: 'Discard an unrecoverable event permanently' })
  @ApiParam({ name: 'eventId', type: 'string', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event discarded' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async discardEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.outboxService.discardEvent(eventId);
  }
}

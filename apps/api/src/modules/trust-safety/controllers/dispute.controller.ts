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
import { DisputeService } from '../services/dispute.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import { createDisputeSchema } from '@localsaathi/validation';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingDisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post(':id/disputes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise an operational dispute for a booking (IDOR protected)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 201, description: 'Dispute raised successfully' })
  async raiseDispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = createDisputeSchema.parse(body);
    return this.disputeService.createDispute(id, user.userId, input);
  }

  @Get(':id/disputes')
  @ApiOperation({ summary: 'List disputes on a booking (IDOR protected)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'List of booking disputes' })
  async getBookingDisputes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.disputeService.getDisputesForBooking(id, user.userId, user.role);
  }
}

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Get('mine')
  @ApiOperation({ summary: 'List disputes involving the current user' })
  @ApiResponse({ status: 200, description: 'List of disputes' })
  async getMyDisputes(@CurrentUser() user: AuthenticatedUser) {
    return this.disputeService.getDisputesForUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dispute details (IDOR protected)' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 200, description: 'Dispute details' })
  async getDisputeById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.disputeService.getDisputeById(id, user.userId, user.role);
  }
}

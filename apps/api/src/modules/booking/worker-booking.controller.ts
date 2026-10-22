import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
import { BookingService } from './booking.service';
import { CancelBookingDto, BookingQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  AuthenticatedUser,
  BookingDetail,
  BookingListResponse,
} from '@localsaathi/types';

@ApiTags('Worker Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workers')
export class WorkerBookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('me/bookings')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'List bookings assigned to authenticated worker',
    description: 'Returns paginated list of bookings with optional status filter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated bookings list',
  })
  async getBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BookingQueryDto
  ): Promise<BookingListResponse> {
    return this.bookingService.getWorkerBookings(user.userId, query);
  }

  @Get('me/bookings/:bookingId')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Get worker booking details by ID',
    description: 'Returns full contract snapshot, employer details, and lifecycle timestamps.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Booking detail',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found or unauthorized',
  })
  async getBookingDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string
  ): Promise<BookingDetail> {
    return this.bookingService.getWorkerBookingDetail(user.userId, bookingId);
  }

  @Post('me/bookings/:bookingId/confirm')
  @Roles(UserRole.WORKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a booking offer (PENDING_CONFIRMATION -> CONFIRMED)',
    description: 'Worker formally confirms the booking contract offered by employer.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Booking successfully confirmed',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: booking is not in PENDING_CONFIRMATION status',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async confirmBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string
  ): Promise<BookingDetail> {
    return this.bookingService.confirmBooking(user.userId, bookingId);
  }

  @Post('me/bookings/:bookingId/cancel')
  @Roles(UserRole.WORKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking with reason attribution (Worker)',
    description: 'Cancels an active booking before completion with reason and role attribution.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Booking successfully cancelled',
  })
  @ApiResponse({
    status: 400,
    description: 'Booking is already in a terminal state or reason is invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: CancelBookingDto
  ): Promise<BookingDetail> {
    return this.bookingService.cancelBooking(
      user.userId,
      UserRole.WORKER,
      bookingId,
      dto
    );
  }
}

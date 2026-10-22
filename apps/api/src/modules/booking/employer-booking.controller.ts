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
import { CreateBookingDto, CancelBookingDto, BookingQueryDto } from './dto';
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

@ApiTags('Employer Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employers')
export class EmployerBookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('me/applications/:applicationId/bookings')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate a booking contract from an accepted application',
    description:
      'Creates a binding contract snapshot for the accepted candidate. Initial status is PENDING_CONFIRMATION.',
  })
  @ApiParam({ name: 'applicationId', description: 'Accepted Application UUID', type: 'string' })
  @ApiResponse({
    status: 201,
    description: 'Booking successfully initiated',
  })
  @ApiResponse({
    status: 400,
    description: 'Application is not in ACCEPTED status or validation failed',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'Booking already exists for this application or worker schedule conflict',
  })
  async createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateBookingDto
  ): Promise<BookingDetail> {
    return this.bookingService.createBooking(user.userId, applicationId, dto);
  }

  @Get('me/bookings')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'List bookings created by authenticated employer',
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
    return this.bookingService.getEmployerBookings(user.userId, query);
  }

  @Get('me/bookings/:bookingId')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'Get employer booking details by ID',
    description: 'Returns full contract snapshot, worker details, and lifecycle timestamps.',
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
    return this.bookingService.getEmployerBookingDetail(user.userId, bookingId);
  }

  @Post('me/bookings/:bookingId/start')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start an engagement (CONFIRMED -> IN_PROGRESS)',
    description: 'Transitions booking to IN_PROGRESS and records startedAt timestamp.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Booking successfully started',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: booking is not in CONFIRMED status',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async startBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string
  ): Promise<BookingDetail> {
    return this.bookingService.startBooking(user.userId, bookingId);
  }

  @Post('me/bookings/:bookingId/complete')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete an engagement (IN_PROGRESS -> COMPLETED)',
    description: 'Marks work completed and increments worker completed jobs counter.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Booking successfully completed',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: booking is not in IN_PROGRESS status',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async completeBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string
  ): Promise<BookingDetail> {
    return this.bookingService.completeBooking(user.userId, bookingId);
  }

  @Post('me/bookings/:bookingId/cancel')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking with reason attribution (Employer)',
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
      UserRole.EMPLOYER,
      bookingId,
      dto
    );
  }
}

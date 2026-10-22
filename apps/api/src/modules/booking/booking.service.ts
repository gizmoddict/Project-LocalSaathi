import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.module';
import {
  createBookingSchema,
  cancelBookingSchema,
  bookingQuerySchema,
  CreateBookingInputSchema,
  CancelBookingInputSchema,
  BookingQueryInputSchema,
} from '@localsaathi/validation';
import {
  BookingStatus,
  UserRole,
  WageType,
  ApplicationStatus,
  BookingSummary,
  BookingDetail,
  BookingListResponse,
  DomainEventType,
} from '@localsaathi/types';
import {
  BOOKING_ERROR_CODES,
  isValidBookingTransition,
  isTerminalBookingState,
} from './booking.constants';
import { DomainEventService } from '../notification/domain-event.service';

function parseDateOnly(dateInput: string | Date): Date {
  if (dateInput instanceof Date) {
    const d = new Date(dateInput);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  const parts = dateInput.split('-');
  const y = parts[0];
  const m = parts[1];
  const dayStr = parts[2];
  if (parts.length === 3 && y && m && dayStr) {
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(dayStr, 10);
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }
  const d = new Date(dateInput);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventService: DomainEventService,
  ) {}


  /**
   * Initiates a binding Booking contract from an ACCEPTED application.
   * Snapshots all contractual terms for historical integrity.
   * Guarded by database unique constraint on applicationId and schedule conflict check.
   */
  async createBooking(
    employerUserId: string,
    applicationId: string,
    rawDto?: CreateBookingInputSchema | unknown
  ): Promise<BookingDetail> {
    const parseResult = createBookingSchema.safeParse(rawDto ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new BadRequestException({
        statusCode: 400,
        error: 'VALIDATION_FAILED',
        message: `Validation failed: ${issues}`,
      });
    }
    const dto = parseResult.data;

    // 1. Verify employer profile
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Employer profile not found',
      });
    }

    // 2. Fetch application with job, worker, and existing booking
    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        jobPost: {
          include: {
            jobLocation: true,
          },
        },
        workerProfile: {
          include: {
            user: true,
            workerSkills: {
              include: { skill: true },
            },
          },
        },
        booking: true,
      },
    });

    if (!app || app.jobPost.employerProfileId !== employer.id) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Application not found or unauthorized',
      });
    }

    // 3. Application must be ACCEPTED
    if (app.status !== ApplicationStatus.ACCEPTED) {
      throw new BadRequestException({
        statusCode: 400,
        error: BOOKING_ERROR_CODES.APPLICATION_NOT_ACCEPTED,
        message: `Only ACCEPTED applications can be converted into bookings. Current application status is ${app.status}.`,
      });
    }

    // 4. One accepted application -> at most one booking
    if (app.booking) {
      throw new ConflictException({
        statusCode: 409,
        error: BOOKING_ERROR_CODES.BOOKING_ALREADY_EXISTS,
        message: 'A booking has already been created for this application.',
      });
    }

    // 5. Compute snapshot contract terms
    const agreedWage =
      dto.agreedWage !== undefined
        ? dto.agreedWage
        : Number(app.jobPost.wageAmount);
    const wageType = (dto.wageType as WageType) ?? (app.jobPost.wageType as WageType);
    const durationDays = dto.durationDays ?? app.jobPost.durationDays ?? 1;

    let totalAmount = agreedWage;
    if (wageType === WageType.DAILY) {
      totalAmount = agreedWage * durationDays;
    } else if (wageType === WageType.HOURLY) {
      totalAmount = agreedWage * 8 * durationDays;
    }

    const startDate = dto.startDate
      ? parseDateOnly(dto.startDate)
      : parseDateOnly(app.jobPost.startDate);

    let endDate: Date | null = null;
    if (dto.endDate) {
      endDate = parseDateOnly(dto.endDate);
    } else if (durationDays > 1) {
      endDate = new Date(startDate.getTime() + (durationDays - 1) * 86400000);
    }

    const startTime = dto.startTime ?? app.jobPost.startTime ?? null;
    const endTime = dto.endTime ?? null;

    const jobTitle = app.jobPost.title;
    const jobCategory = app.jobPost.category;
    const workLocationAddress =
      dto.workLocationAddress ?? app.jobPost.jobLocation?.addressLine ?? null;
    const workLocationLocality =
      dto.workLocationLocality ?? app.jobPost.jobLocation?.locality ?? null;
    const workLocationCity =
      dto.workLocationCity ?? app.jobPost.jobLocation?.city ?? null;
    const workLocationState =
      dto.workLocationState ?? app.jobPost.jobLocation?.state ?? null;
    const workLocationPinCode =
      dto.workLocationPinCode ?? app.jobPost.jobLocation?.pinCode ?? null;
    const workLocationLatitude = app.jobPost.jobLocation?.latitude ?? null;
    const workLocationLongitude = app.jobPost.jobLocation?.longitude ?? null;
    const workerName = app.workerProfile.displayName;
    const employerName = employer.businessName;

    // 6. Run atomic transaction with double-booking schedule check & create
    let createdBookingId: string;
    let createdEventId: string | undefined;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Worker schedule conflict check: cannot have another CONFIRMED or IN_PROGRESS booking on same startDate
        const dayAfter = new Date(startDate);
        dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

        const conflict = await tx.booking.findFirst({
          where: {
            workerProfileId: app.workerProfileId,
            status: {
              in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS],
            },
            startDate: {
              gte: startDate,
              lt: dayAfter,
            },
          },
        });

        if (conflict) {
          throw new ConflictException({
            statusCode: 409,
            error: BOOKING_ERROR_CODES.WORKER_SCHEDULE_CONFLICT,
            message:
              'Worker already has a confirmed or in-progress booking scheduled on this date.',
          });
        }

        const newBooking = await tx.booking.create({
          data: {
            jobPostId: app.jobPostId,
            applicationId: app.id,
            employerProfileId: employer.id,
            workerProfileId: app.workerProfileId,
            status: BookingStatus.PENDING_CONFIRMATION,
            jobTitle,
            jobCategory,
            agreedWage: new Prisma.Decimal(agreedWage),
            wageType,
            totalAmount: new Prisma.Decimal(totalAmount),
            currency: 'INR',
            startDate,
            endDate,
            startTime,
            endTime,
            durationDays,
            workLocationAddress,
            workLocationLocality,
            workLocationCity,
            workLocationState,
            workLocationPinCode,
            workLocationLatitude,
            workLocationLongitude,
            workerName,
            employerName,
          },
        });

        // Atomic Transactional Outbox event creation
        const eventId = await this.domainEventService.createEvent(
          {
            type: DomainEventType.BOOKING_CREATED,
            actorId: employerUserId,
            entityType: 'Booking',
            entityId: newBooking.id,
            payload: {
              jobTitle,
              jobId: app.jobPostId,
              bookingId: newBooking.id,
              applicationId,
              workerId: app.workerProfile.user.id,
              employerId: employerUserId,
              startDate: startDate.toISOString().split('T')[0],
            },
          },
          tx
        );

        return { bookingId: newBooking.id, eventId };
      });
      createdBookingId = result.bookingId;
      createdEventId = result.eventId;
    } catch (err: any) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: BOOKING_ERROR_CODES.BOOKING_ALREADY_EXISTS,
          message: 'A booking has already been created for this application.',
        });
      }
      throw err;
    }

    this.logger.log(
      `Booking created: ID=${createdBookingId}, ApplicationId=${applicationId}, EmployerId=${employer.id}`
    );

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for BOOKING_CREATED: ${err}`)
        );
    }

    return this.getEmployerBookingDetail(employerUserId, createdBookingId);
  }


  /**
   * List bookings for the authenticated employer.
   */
  async getEmployerBookings(
    employerUserId: string,
    rawQuery?: Partial<BookingQueryInputSchema> | Record<string, unknown>
  ): Promise<BookingListResponse> {
    const parseResult = bookingQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;

    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const where: Prisma.BookingWhereInput = {
      employerProfileId: employer.id,
    };
    if (query.status) {
      where.status = query.status as BookingStatus;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const orderBy: Prisma.BookingOrderByWithRelationInput =
      query.sort === 'start_date_asc'
        ? { startDate: 'asc' }
        : { createdAt: 'desc' };

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return {
      items: bookings.map((b) => this.mapToSummary(b)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  }

  /**
   * View booking details for the authenticated employer (IDOR guarded).
   */
  async getEmployerBookingDetail(
    employerUserId: string,
    bookingId: string
  ): Promise<BookingDetail> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        jobPost: true,
        workerProfile: {
          include: {
            workerSkills: {
              include: { skill: true },
            },
          },
        },
        employerProfile: true,
      },
    });

    if (!booking || booking.employerProfileId !== employer.id) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }

    return this.mapToDetail(booking);
  }

  /**
   * List bookings for the authenticated worker.
   */
  async getWorkerBookings(
    workerUserId: string,
    rawQuery?: Partial<BookingQueryInputSchema> | Record<string, unknown>
  ): Promise<BookingListResponse> {
    const parseResult = bookingQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;

    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const where: Prisma.BookingWhereInput = {
      workerProfileId: worker.id,
    };
    if (query.status) {
      where.status = query.status as BookingStatus;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const orderBy: Prisma.BookingOrderByWithRelationInput =
      query.sort === 'start_date_asc'
        ? { startDate: 'asc' }
        : { createdAt: 'desc' };

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return {
      items: bookings.map((b) => this.mapToSummary(b)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  }

  /**
   * View booking details for the authenticated worker (IDOR guarded).
   */
  async getWorkerBookingDetail(
    workerUserId: string,
    bookingId: string
  ): Promise<BookingDetail> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        jobPost: true,
        workerProfile: {
          include: {
            workerSkills: {
              include: { skill: true },
            },
          },
        },
        employerProfile: true,
      },
    });

    if (!booking || booking.workerProfileId !== worker.id) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }

    return this.mapToDetail(booking);
  }

  /**
   * Worker confirms a pending booking offer (PENDING_CONFIRMATION -> CONFIRMED).
   */
  async confirmBooking(
    workerUserId: string,
    bookingId: string
  ): Promise<BookingDetail> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const bookingRestriction = await this.prisma.userRestriction?.findFirst?.({
      where: {
        userId: workerUserId,
        restrictionType: 'CANNOT_ACCEPT_BOOKINGS' as any,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (bookingRestriction) {
      throw new ForbiddenException({
        code: 'USER_RESTRICTED',
        message: `Confirming bookings is restricted on your account: ${bookingRestriction.reason}`,
      });
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking || booking.workerProfileId !== worker.id) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }

    const currentStatus = booking.status as BookingStatus;
    if (!isValidBookingTransition(currentStatus, BookingStatus.CONFIRMED)) {
      throw new BadRequestException({
        statusCode: 400,
        error: BOOKING_ERROR_CODES.INVALID_TRANSITION,
        message: `Cannot confirm booking in ${currentStatus} status. Only PENDING_CONFIRMATION bookings can be confirmed.`,
      });
    }

    let eventId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      const empProfile = await tx.employerProfile.findUnique({
        where: { id: booking.employerProfileId },
        select: { userId: true },
      });

      eventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.BOOKING_CONFIRMED,
          actorId: workerUserId,
          entityType: 'Booking',
          entityId: bookingId,
          payload: {
            jobTitle: booking.jobTitle ?? undefined,
            bookingId,
            workerId: workerUserId,
            employerId: empProfile?.userId ?? undefined,
          },
        },
        tx
      );
    });

    this.logger.log(`Booking ${bookingId} confirmed by worker ${worker.id}`);

    if (eventId) {
      this.domainEventService
        .processEvent(eventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for BOOKING_CONFIRMED: ${err}`)
        );
    }

    return this.getWorkerBookingDetail(workerUserId, bookingId);
  }


  /**
   * Employer begins the engagement (CONFIRMED -> IN_PROGRESS).
   */
  async startBooking(
    employerUserId: string,
    bookingId: string
  ): Promise<BookingDetail> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking || booking.employerProfileId !== employer.id) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }

    const currentStatus = booking.status as BookingStatus;
    if (!isValidBookingTransition(currentStatus, BookingStatus.IN_PROGRESS)) {
      throw new BadRequestException({
        statusCode: 400,
        error: BOOKING_ERROR_CODES.INVALID_TRANSITION,
        message: `Cannot start booking in ${currentStatus} status. Only CONFIRMED bookings can be started.`,
      });
    }

    let eventId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });

      const wrkProfile = await tx.workerProfile.findUnique({
        where: { id: booking.workerProfileId },
        select: { userId: true },
      });

      eventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.BOOKING_STARTED,
          actorId: employerUserId,
          entityType: 'Booking',
          entityId: bookingId,
          payload: {
            jobTitle: booking.jobTitle ?? undefined,
            bookingId,
            workerId: wrkProfile?.userId ?? undefined,
            employerId: employerUserId,
          },
        },
        tx
      );
    });

    this.logger.log(
      `Booking ${bookingId} marked IN_PROGRESS by employer ${employer.id}`
    );

    if (eventId) {
      this.domainEventService
        .processEvent(eventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for BOOKING_STARTED: ${err}`)
        );
    }

    return this.getEmployerBookingDetail(employerUserId, bookingId);
  }


  /**
   * Employer marks the engagement as completed (IN_PROGRESS -> COMPLETED).
   */
  async completeBooking(
    employerUserId: string,
    bookingId: string
  ): Promise<BookingDetail> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking || booking.employerProfileId !== employer.id) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }

    const currentStatus = booking.status as BookingStatus;
    if (!isValidBookingTransition(currentStatus, BookingStatus.COMPLETED)) {
      throw new BadRequestException({
        statusCode: 400,
        error: BOOKING_ERROR_CODES.INVALID_TRANSITION,
        message: `Cannot complete booking in ${currentStatus} status. Only IN_PROGRESS bookings can be completed.`,
      });
    }

    let eventId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      await tx.workerProfile.update({
        where: { id: booking.workerProfileId },
        data: {
          completedJobsCount: { increment: 1 },
        },
      });

      const wrkProfileC = await tx.workerProfile.findUnique({
        where: { id: booking.workerProfileId },
        select: { userId: true },
      });

      eventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.BOOKING_COMPLETED,
          actorId: employerUserId,
          entityType: 'Booking',
          entityId: bookingId,
          payload: {
            jobTitle: booking.jobTitle ?? undefined,
            bookingId,
            workerId: wrkProfileC?.userId ?? undefined,
            employerId: employerUserId,
          },
        },
        tx
      );
    });

    this.logger.log(
      `Booking ${bookingId} completed by employer ${employer.id}`
    );

    if (eventId) {
      this.domainEventService
        .processEvent(eventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for BOOKING_COMPLETED: ${err}`)
        );
    }

    return this.getEmployerBookingDetail(employerUserId, bookingId);
  }


  /**
   * Cancels a booking with reason attribution.
   * Can be initiated by either WORKER or EMPLOYER before terminal completion.
   */
  async cancelBooking(
    userId: string,
    userRole: UserRole,
    bookingId: string,
    rawDto: CancelBookingInputSchema | unknown
  ): Promise<BookingDetail> {
    const parseResult = cancelBookingSchema.safeParse(rawDto);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new BadRequestException({
        statusCode: 400,
        error: 'VALIDATION_FAILED',
        message: `Validation failed: ${issues}`,
      });
    }
    const dto = parseResult.data;

    let profileId: string;
    let isEmployer = false;

    if (userRole === UserRole.EMPLOYER) {
      isEmployer = true;
      const employer = await this.prisma.employerProfile.findUnique({
        where: { userId },
      });
      if (!employer) {
        throw new NotFoundException('Employer profile not found');
      }
      profileId = employer.id;
    } else {
      const worker = await this.prisma.workerProfile.findUnique({
        where: { userId },
      });
      if (!worker) {
        throw new NotFoundException('Worker profile not found');
      }
      profileId = worker.id;
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found',
      });
    }

    if (isEmployer && booking.employerProfileId !== profileId) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }
    if (!isEmployer && booking.workerProfileId !== profileId) {
      throw new NotFoundException({
        statusCode: 404,
        error: BOOKING_ERROR_CODES.NOT_FOUND,
        message: 'Booking not found or unauthorized',
      });
    }

    const currentStatus = booking.status as BookingStatus;
    if (isTerminalBookingState(currentStatus)) {
      throw new BadRequestException({
        statusCode: 400,
        error: BOOKING_ERROR_CODES.TERMINAL_STATE,
        message: `Cannot cancel booking in ${currentStatus} status. It is already in a terminal state.`,
      });
    }

    let eventId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
          cancelledByRole: userRole,
        },
      });

      const [wrkCan, empCan] = await Promise.all([
        tx.workerProfile.findUnique({
          where: { id: booking.workerProfileId },
          select: { userId: true },
        }),
        tx.employerProfile.findUnique({
          where: { id: booking.employerProfileId },
          select: { userId: true },
        }),
      ]);

      eventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.BOOKING_CANCELLED,
          actorId: userId,
          entityType: 'Booking',
          entityId: bookingId,
          payload: {
            jobTitle: booking.jobTitle ?? undefined,
            bookingId,
            workerId: wrkCan?.userId ?? undefined,
            employerId: empCan?.userId ?? undefined,
          },
        },
        tx
      );
    });

    this.logger.log(
      `Booking ${bookingId} cancelled by ${userRole} ${userId}: reason="${dto.reason}"`
    );

    if (eventId) {
      this.domainEventService
        .processEvent(eventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for BOOKING_CANCELLED: ${err}`)
        );
    }

    return isEmployer
      ? this.getEmployerBookingDetail(userId, bookingId)
      : this.getWorkerBookingDetail(userId, bookingId);
  }


  // ---------------------------------------------------------------------------
  // Mapping Helpers
  // ---------------------------------------------------------------------------

  private mapToSummary(b: any): BookingSummary {
    return {
      id: b.id,
      jobPostId: b.jobPostId,
      applicationId: b.applicationId,
      employerProfileId: b.employerProfileId,
      workerProfileId: b.workerProfileId,
      status: b.status as BookingStatus,
      jobTitle: b.jobTitle || 'Engagement',
      jobCategory: b.jobCategory || 'General',
      agreedWage: b.agreedWage ? Number(b.agreedWage) : 0,
      wageType: (b.wageType as WageType) || WageType.DAILY,
      totalAmount: b.totalAmount ? Number(b.totalAmount) : 0,
      currency: b.currency || 'INR',
      startDate: b.startDate ? b.startDate.toISOString().split('T')[0] : '',
      endDate: b.endDate ? b.endDate.toISOString().split('T')[0] : null,
      startTime: b.startTime,
      endTime: b.endTime,
      durationDays: b.durationDays || 1,
      workLocationLocality: b.workLocationLocality,
      workLocationCity: b.workLocationCity,
      workerName: b.workerName || 'Worker',
      employerName: b.employerName || 'Employer',
      confirmedAt: b.confirmedAt ? b.confirmedAt.toISOString() : null,
      startedAt: b.startedAt ? b.startedAt.toISOString() : null,
      completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private mapToDetail(b: any): BookingDetail {
    const summary = this.mapToSummary(b);
    return {
      ...summary,
      workLocationAddress: b.workLocationAddress,
      workLocationState: b.workLocationState,
      workLocationPinCode: b.workLocationPinCode,
      workLocationLatitude: b.workLocationLatitude,
      workLocationLongitude: b.workLocationLongitude,
      cancellationReason: b.cancellationReason,
      cancelledByRole: b.cancelledByRole as UserRole | null,
      job: {
        id: b.jobPost?.id || b.jobPostId,
        title: b.jobPost?.title || b.jobTitle || '',
        description: b.jobPost?.description || '',
        category: b.jobPost?.category || b.jobCategory || '',
        status: b.jobPost?.status || '',
      },
      worker: {
        id: b.workerProfile?.id || b.workerProfileId,
        displayName: b.workerProfile?.displayName || b.workerName || '',
        experienceYears: b.workerProfile?.experienceYears || 0,
        skills: (b.workerProfile?.workerSkills || []).map((ws: any) => ({
          name: ws.skill?.name || '',
          proficiency: ws.proficiency,
        })),
      },
      employer: {
        id: b.employerProfile?.id || b.employerProfileId,
        businessName: b.employerProfile?.businessName || b.employerName || '',
        businessType: b.employerProfile?.businessType || '',
        locality: b.employerProfile?.locality || null,
        city: b.employerProfile?.city || null,
      },
    };
  }
}

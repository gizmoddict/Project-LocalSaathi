import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkerBookingController } from '../worker-booking.controller';
import { EmployerBookingController } from '../employer-booking.controller';
import { BookingService } from '../booking.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  BookingStatus,
  WageType,
  BookingDetail,
} from '@localsaathi/types';

describe('Booking Controllers & RBAC Guard Tests', () => {
  let workerController: WorkerBookingController;
  let employerController: EmployerBookingController;
  let bookingService: jest.Mocked<BookingService>;
  let rolesGuard: RolesGuard;

  const mockWorkerUser: AuthenticatedUser = {
    userId: 'worker-user-uuid',
    sessionId: 'sess-worker',
    role: UserRole.WORKER,
  };

  const mockEmployerUser: AuthenticatedUser = {
    userId: 'employer-user-uuid',
    sessionId: 'sess-employer',
    role: UserRole.EMPLOYER,
  };

  const mockBookingDetail: BookingDetail = {
    id: 'booking-uuid',
    jobPostId: 'job-uuid',
    applicationId: 'app-uuid',
    employerProfileId: 'emp-uuid',
    workerProfileId: 'wkr-uuid',
    status: BookingStatus.PENDING_CONFIRMATION,
    jobTitle: 'Electrician',
    jobCategory: 'Electrical',
    agreedWage: 900,
    wageType: WageType.DAILY,
    totalAmount: 900,
    currency: 'INR',
    startDate: '2026-10-20',
    endDate: null,
    startTime: '09:00',
    endTime: '18:00',
    durationDays: 1,
    workLocationAddress: 'Shop 10',
    workLocationLocality: 'Hazratganj',
    workLocationCity: 'Lucknow',
    workLocationState: 'UP',
    workLocationPinCode: '226001',
    workLocationLatitude: 26.85,
    workLocationLongitude: 80.95,
    workerName: 'Ramesh Kumar',
    employerName: 'Shri Enterprises',
    confirmedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    cancelledByRole: null,
    createdAt: new Date().toISOString(),
    job: {
      id: 'job-uuid',
      title: 'Electrician',
      description: 'Job desc',
      category: 'Electrical',
      status: 'PUBLISHED',
    },
    worker: {
      id: 'wkr-uuid',
      displayName: 'Ramesh Kumar',
      experienceYears: 4,
      skills: [{ name: 'Wiring', proficiency: 'ADVANCED' }],
    },
    employer: {
      id: 'emp-uuid',
      businessName: 'Shri Enterprises',
      businessType: 'Retail',
      locality: 'Hazratganj',
      city: 'Lucknow',
    },
  };

  beforeEach(async () => {
    const mockService = {
      createBooking: jest.fn().mockResolvedValue(mockBookingDetail),
      getEmployerBookings: jest.fn().mockResolvedValue({
        items: [mockBookingDetail],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false },
      }),
      getEmployerBookingDetail: jest.fn().mockResolvedValue(mockBookingDetail),
      startBooking: jest.fn().mockResolvedValue({
        ...mockBookingDetail,
        status: BookingStatus.IN_PROGRESS,
        startedAt: new Date().toISOString(),
      }),
      completeBooking: jest.fn().mockResolvedValue({
        ...mockBookingDetail,
        status: BookingStatus.COMPLETED,
        completedAt: new Date().toISOString(),
      }),
      cancelBooking: jest.fn().mockResolvedValue({
        ...mockBookingDetail,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
      }),
      getWorkerBookings: jest.fn().mockResolvedValue({
        items: [mockBookingDetail],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false },
      }),
      getWorkerBookingDetail: jest.fn().mockResolvedValue(mockBookingDetail),
      confirmBooking: jest.fn().mockResolvedValue({
        ...mockBookingDetail,
        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date().toISOString(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerBookingController, EmployerBookingController],
      providers: [
        { provide: BookingService, useValue: mockService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    workerController = module.get(WorkerBookingController);
    employerController = module.get(EmployerBookingController);
    bookingService = module.get(BookingService);
    rolesGuard = module.get(RolesGuard);
  });

  describe('1. Controller Method Routing and Delegation', () => {
    it('1.1 EmployerBookingController delegates createBooking with employer user ID', async () => {
      const res = await employerController.createBooking(
        mockEmployerUser,
        'app-uuid',
        { agreedWage: 900 }
      );
      expect(bookingService.createBooking).toHaveBeenCalledWith(
        mockEmployerUser.userId,
        'app-uuid',
        { agreedWage: 900 }
      );
      expect(res.id).toBe('booking-uuid');
    });

    it('1.2 EmployerBookingController delegates startBooking, completeBooking, cancelBooking', async () => {
      await employerController.startBooking(mockEmployerUser, 'booking-uuid');
      expect(bookingService.startBooking).toHaveBeenCalledWith(
        mockEmployerUser.userId,
        'booking-uuid'
      );

      await employerController.completeBooking(mockEmployerUser, 'booking-uuid');
      expect(bookingService.completeBooking).toHaveBeenCalledWith(
        mockEmployerUser.userId,
        'booking-uuid'
      );

      await employerController.cancelBooking(mockEmployerUser, 'booking-uuid', {
        reason: 'Project cancelled',
      });
      expect(bookingService.cancelBooking).toHaveBeenCalledWith(
        mockEmployerUser.userId,
        UserRole.EMPLOYER,
        'booking-uuid',
        { reason: 'Project cancelled' }
      );
    });

    it('1.3 WorkerBookingController delegates confirmBooking and cancelBooking', async () => {
      await workerController.confirmBooking(mockWorkerUser, 'booking-uuid');
      expect(bookingService.confirmBooking).toHaveBeenCalledWith(
        mockWorkerUser.userId,
        'booking-uuid'
      );

      await workerController.cancelBooking(mockWorkerUser, 'booking-uuid', {
        reason: 'Medical emergency',
      });
      expect(bookingService.cancelBooking).toHaveBeenCalledWith(
        mockWorkerUser.userId,
        UserRole.WORKER,
        'booking-uuid',
        { reason: 'Medical emergency' }
      );
    });
  });

  describe('2. RolesGuard Enforcement (RBAC)', () => {
    function createMockContext(user: AuthenticatedUser, handler: any): ExecutionContext {
      return {
        getHandler: () => handler,
        getClass: () => EmployerBookingController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext;
    }

    it('2.1 Allows EMPLOYER to access createBooking on EmployerBookingController', () => {
      const ctx = createMockContext(mockEmployerUser, employerController.createBooking);
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('2.2 Forbids WORKER from calling createBooking on EmployerBookingController', () => {
      const ctx = createMockContext(mockWorkerUser, employerController.createBooking);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('2.3 Allows WORKER to access confirmBooking on WorkerBookingController', () => {
      const ctx = {
        getHandler: () => workerController.confirmBooking,
        getClass: () => WorkerBookingController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockWorkerUser }),
        }),
      } as unknown as ExecutionContext;
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('2.4 Forbids EMPLOYER from calling confirmBooking on WorkerBookingController', () => {
      const ctx = {
        getHandler: () => workerController.confirmBooking,
        getClass: () => WorkerBookingController,
        switchToHttp: () => ({
          getRequest: () => ({ user: mockEmployerUser }),
        }),
      } as unknown as ExecutionContext;
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});

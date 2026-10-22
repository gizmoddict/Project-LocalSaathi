import { NotFoundException } from '@nestjs/common';
import { WorkerService } from '../worker.service';
import { updateWorkerLocationSchema } from '@localsaathi/validation';
import { WorkerWithFullRelations } from '../types/worker-internal.types';
import { WageType } from '@localsaathi/types';

describe('Worker Location & Map Persistence Unit Tests', () => {
  let workerService: WorkerService;
  let mockPrisma: any;

  const createMockWorker = (overrides: Partial<WorkerWithFullRelations> = {}): WorkerWithFullRelations => ({
    id: 'worker-profile-100',
    userId: 'user-worker-100',
    displayName: 'Mohan Sharma',
    profilePhotoKey: null,
    bio: 'Electrician & Wireman',
    experienceYears: 4,
    expectedWage: 900 as any,
    wageType: WageType.DAILY as any,
    preferredRadiusKm: 10,
    languages: ['hi'],
    isAvailable: true,
    completedJobsCount: 0,
    avgRating: 0 as any,
    ratingCount: 0,
    reliabilityScore: 100 as any,
    onboardingStatus: 'COMPLETED' as any,
    onboardingCompletedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: {
      id: 'user-worker-100',
      phone: '9876543210',
      role: 'WORKER' as any,
      accountStatus: 'ACTIVE' as any,
      verificationStatus: 'VERIFIED' as any,
      createdAt: new Date(),
    },
    workerSkills: [],
    workerLocation: {
      id: 'loc-100',
      workerProfileId: 'worker-profile-100',
      latitude: 26.85,
      longitude: 80.948,
      accuracyMeters: 10,
      addressLine: 'Hazratganj Market',
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      isActive: true,
      updatedAt: new Date(),
    } as any,
    availabilities: [],
    ...overrides,
  });

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      workerProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      workerLocation: {
        upsert: jest.fn(),
      },
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => {
        return cb(mockPrisma);
      }),
    };

    const mockCompletionService = {
      calculate: jest.fn().mockReturnValue({ isComplete: true, completionPercentage: 100 }),
    } as any;
    const mockImageStorageService = {} as any;

    workerService = new WorkerService(mockPrisma, mockCompletionService, mockImageStorageService);
  });

  describe('1. Coordinate & Radius Boundary Validation', () => {
    it('accepts valid latitude, longitude, address, and preferred radius', () => {
      const validPayload = {
        latitude: 26.85,
        longitude: 80.948,
        accuracyMeters: 15,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
        preferredRadiusKm: 25,
      };

      const result = updateWorkerLocationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredRadiusKm).toBe(25);
        expect(result.data.latitude).toBe(26.85);
      }
    });

    it('rejects latitude out of bounds (< -90 or > 90)', () => {
      const invalidLat = {
        latitude: 95.1234,
        longitude: 80.948,
      };
      const res = updateWorkerLocationSchema.safeParse(invalidLat);
      expect(res.success).toBe(false);
    });

    it('rejects longitude out of bounds (< -180 or > 180)', () => {
      const invalidLon = {
        latitude: 26.85,
        longitude: 185.0,
      };
      const res = updateWorkerLocationSchema.safeParse(invalidLon);
      expect(res.success).toBe(false);
    });

    it('rejects invalid PIN code format', () => {
      const invalidPin = {
        latitude: 26.85,
        longitude: 80.948,
        pinCode: '0226001', // 7 digits
      };
      const res = updateWorkerLocationSchema.safeParse(invalidPin);
      expect(res.success).toBe(false);
    });

    it('rejects preferred radius exceeding 100 km limit or negative', () => {
      const excessiveRadius = {
        latitude: 26.85,
        longitude: 80.948,
        preferredRadiusKm: 150,
      };
      const res = updateWorkerLocationSchema.safeParse(excessiveRadius);
      expect(res.success).toBe(false);

      const negativeRadius = {
        latitude: 26.85,
        longitude: 80.948,
        preferredRadiusKm: -5,
      };
      const res2 = updateWorkerLocationSchema.safeParse(negativeRadius);
      expect(res2.success).toBe(false);
    });
  });

  describe('2. Location Persistence & Profile Update Workflow', () => {
    it('persists confirmed location and updates preferred radius atomically', async () => {
      const existingWorker = createMockWorker();
      mockPrisma.workerProfile.findUnique
        .mockResolvedValueOnce(existingWorker) // initial lookup
        .mockResolvedValueOnce({
          ...existingWorker,
          preferredRadiusKm: 25,
          workerLocation: {
            ...existingWorker.workerLocation,
            latitude: 26.89,
            longitude: 80.94,
            locality: 'Aliganj',
            city: 'Lucknow',
          },
        }); // refreshed lookup

      const dto = {
        latitude: 26.89,
        longitude: 80.94,
        locality: 'Aliganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226024',
        preferredRadiusKm: 25,
      };

      const resp = await workerService.updateLocation('user-worker-100', dto);

      expect(mockPrisma.workerLocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workerProfileId: 'worker-profile-100' },
          update: expect.objectContaining({
            latitude: 26.89,
            longitude: 80.94,
            locality: 'Aliganj',
            city: 'Lucknow',
          }),
        })
      );

      // Verifies PostGIS Point update executed with SRID 4326
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography'),
        80.94,
        26.89,
        'worker-profile-100'
      );

      // Verifies preferred radius updated on worker profile
      expect(mockPrisma.workerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'worker-profile-100' },
          data: { preferredRadiusKm: 25 },
        })
      );

      expect(resp.latitude).toBe(26.89);
      expect(resp.longitude).toBe(80.94);
      expect(resp.preferredRadiusKm).toBe(25);
    });

    it('changing a previously saved location overwrites old location without data corruption', async () => {
      const existingWorker = createMockWorker({
        preferredRadiusKm: 10,
      });

      mockPrisma.workerProfile.findUnique
        .mockResolvedValueOnce(existingWorker)
        .mockResolvedValueOnce({
          ...existingWorker,
          preferredRadiusKm: 50,
          workerLocation: {
            ...existingWorker.workerLocation,
            latitude: 28.63,
            longitude: 77.22,
            locality: 'Connaught Place',
            city: 'New Delhi',
            pinCode: '110001',
          },
        });

      const newLocationDto = {
        latitude: 28.63,
        longitude: 77.22,
        locality: 'Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        pinCode: '110001',
        preferredRadiusKm: 50,
      };

      const result = await workerService.updateLocation('user-worker-100', newLocationDto);
      expect(result.locality).toBe('Connaught Place');
      expect(result.city).toBe('New Delhi');
      expect(result.preferredRadiusKm).toBe(50);
    });

    it('rejects update for non-existent worker profile', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        workerService.updateLocation('non-existent-user', {
          latitude: 26.85,
          longitude: 80.948,
        })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Location Retrieval Security', () => {
    it('retrieves authenticated worker location coordinates', async () => {
      const worker = createMockWorker();
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(worker);

      const loc = await workerService.getLocation('user-worker-100');
      expect(loc).not.toBeNull();
      expect(loc?.latitude).toBe(26.85);
      expect(loc?.longitude).toBe(80.948);
      expect(loc?.locality).toBe('Hazratganj');
    });

    it('returns null if worker has no configured location', async () => {
      const workerWithoutLoc = createMockWorker({ workerLocation: null as any });
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(workerWithoutLoc);

      const loc = await workerService.getLocation('user-worker-100');
      expect(loc).toBeNull();
    });
  });
});

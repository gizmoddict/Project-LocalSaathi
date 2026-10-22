import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JobService } from '../job.service';
import { EmployerService } from '../../employer/employer.service';
import { PrismaService } from '../../database/database.module';
import { JobStatus, WageType, JobUrgency } from '@localsaathi/types';

describe('JobService (Unit Tests & State Machine)', () => {
  let jobService: JobService;
  let employerServiceMock: {
    findEmployerByUserId: jest.Mock;
  };
  let prismaMock: {
    jobPost: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    jobRequiredSkill: {
      upsert: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    jobLocation: {
      create: jest.Mock;
      upsert: jest.Mock;
    };
    skill: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    employerProfile: {
      update: jest.Mock;
    };
  };

  const sampleEmployer = {
    id: 'emp-101',
    userId: 'user-emp-1',
    businessName: 'Sharma Enterprise',
  };

  const sampleJob = {
    id: 'job-201',
    employerProfileId: 'emp-101',
    title: 'Experienced Welder Needed',
    description: 'Looking for a certified welder for structural fabrication.',
    status: JobStatus.DRAFT,
    category: 'Welding',
    wageType: WageType.DAILY,
    wageAmount: 1500,
    workerCount: 2,
    durationDays: 5,
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    startTime: '09:00',
    urgency: JobUrgency.STANDARD,
    requirements: ['Must have safety visor'],
    languageRequirements: ['hi', 'en'],
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    jobRequiredSkills: [
      {
        id: 'rs-1',
        skillId: 'sk-1',
        isRequired: true,
        minExperienceYears: 2,
        skill: { name: 'Arc Welding', category: 'Welding' },
      },
    ],
    jobLocation: {
      id: 'loc-1',
      jobPostId: 'job-201',
      latitude: 12.9716,
      longitude: 77.5946,
      addressLine: '12 Industrial Area',
      locality: 'Peenya',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560058',
    },
  };

  beforeEach(async () => {
    employerServiceMock = {
      findEmployerByUserId: jest.fn().mockResolvedValue(sampleEmployer),
    };

    prismaMock = {
      jobPost: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      jobRequiredSkill: {
        upsert: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      jobLocation: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
      skill: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      employerProfile: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: EmployerService, useValue: employerServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    jobService = module.get<JobService>(JobService);
  });

  describe('createJob', () => {
    it('should create a job in DRAFT status and increment totalJobsPosted', async () => {
      prismaMock.jobPost.create.mockResolvedValue(sampleJob);
      prismaMock.skill.upsert.mockResolvedValue({ id: 'sk-1' });
      prismaMock.jobPost.findFirst.mockResolvedValue(sampleJob);

      const result = await jobService.createJob('user-emp-1', {
        title: 'Experienced Welder Needed',
        description: 'Looking for a certified welder for structural fabrication.',
        category: 'Welding',
        wageType: 'DAILY',
        wageAmount: 1500,
        startDate: '2026-11-01',
        skills: [{ name: 'Arc Welding', isRequired: true, minExperienceYears: 2 }],
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          locality: 'Peenya',
          city: 'Bengaluru',
          state: 'Karnataka',
          pinCode: '560058',
        },
      });

      expect(prismaMock.jobPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.DRAFT,
            employerProfileId: 'emp-101',
          }),
        })
      );
      expect(prismaMock.employerProfile.update).toHaveBeenCalledWith({
        where: { id: 'emp-101' },
        data: { totalJobsPosted: { increment: 1 } },
      });
      expect(result.status).toBe(JobStatus.DRAFT);
    });

    it('should reject creation when required title or description is too short', async () => {
      await expect(
        jobService.createJob('user-emp-1', {
          title: 'AB', // too short (< 3)
          description: 'Short', // too short (< 10)
          category: 'General',
          wageType: 'DAILY',
          wageAmount: 500,
          startDate: '2026-11-01',
        })
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('IDOR Security', () => {
    it('should throw NotFoundException if job does not belong to authenticated employer', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(jobService.getJobById('user-emp-1', 'job-foreign-999')).rejects.toThrow(
        NotFoundException
      );

      expect(prismaMock.jobPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'job-foreign-999',
            employerProfileId: 'emp-101',
          }),
        })
      );
    });
  });

  describe('Job Lifecycle State Transitions', () => {
    it('should successfully publish a valid DRAFT job', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(sampleJob);
      prismaMock.jobPost.update.mockResolvedValue({
        ...sampleJob,
        status: JobStatus.PUBLISHED,
        publishedAt: new Date(),
      });

      const published = await jobService.publishJob('user-emp-1', 'job-201');

      expect(prismaMock.jobPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-201' },
          data: expect.objectContaining({
            status: JobStatus.PUBLISHED,
          }),
        })
      );
      expect(published).toBeDefined();
    });

    it('should block publishing if job has no required skills attached', async () => {
      const jobWithoutSkills = {
        ...sampleJob,
        jobRequiredSkills: [],
      };
      prismaMock.jobPost.findFirst.mockResolvedValue(jobWithoutSkills);

      await expect(jobService.publishJob('user-emp-1', 'job-201')).rejects.toThrow(
        UnprocessableEntityException
      );
    });

    it('should block publishing if job has no location attached', async () => {
      const jobWithoutLocation = {
        ...sampleJob,
        jobLocation: null,
      };
      prismaMock.jobPost.findFirst.mockResolvedValue(jobWithoutLocation);

      await expect(jobService.publishJob('user-emp-1', 'job-201')).rejects.toThrow(
        UnprocessableEntityException
      );
    });

    it('should pause a PUBLISHED job (PUBLISHED -> PAUSED)', async () => {
      const publishedJob = { ...sampleJob, status: JobStatus.PUBLISHED };
      prismaMock.jobPost.findFirst.mockResolvedValue(publishedJob);
      prismaMock.jobPost.update.mockResolvedValue({
        ...publishedJob,
        status: JobStatus.PAUSED,
      });

      await jobService.pauseJob('user-emp-1', 'job-201');

      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-201' },
        data: { status: JobStatus.PAUSED },
      });
    });

    it('should reject pausing a DRAFT job with BadRequestException', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(sampleJob); // status is DRAFT

      await expect(jobService.pauseJob('user-emp-1', 'job-201')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should resume a PAUSED job (PAUSED -> PUBLISHED)', async () => {
      const pausedJob = { ...sampleJob, status: JobStatus.PAUSED };
      prismaMock.jobPost.findFirst.mockResolvedValue(pausedJob);
      prismaMock.jobPost.update.mockResolvedValue({
        ...pausedJob,
        status: JobStatus.PUBLISHED,
      });

      await jobService.resumeJob('user-emp-1', 'job-201');

      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-201' },
        data: { status: JobStatus.PUBLISHED },
      });
    });

    it('should fill an active job (PUBLISHED -> FILLED)', async () => {
      const publishedJob = { ...sampleJob, status: JobStatus.PUBLISHED };
      prismaMock.jobPost.findFirst.mockResolvedValue(publishedJob);
      prismaMock.jobPost.update.mockResolvedValue({
        ...publishedJob,
        status: JobStatus.FILLED,
      });

      await jobService.fillJob('user-emp-1', 'job-201');

      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-201' },
        data: { status: JobStatus.FILLED },
      });
    });

    it('should close an active job (PUBLISHED -> CANCELLED)', async () => {
      const publishedJob = { ...sampleJob, status: JobStatus.PUBLISHED };
      prismaMock.jobPost.findFirst.mockResolvedValue(publishedJob);
      prismaMock.jobPost.update.mockResolvedValue({
        ...publishedJob,
        status: JobStatus.CANCELLED,
      });

      await jobService.closeJob('user-emp-1', 'job-201');

      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-201' },
        data: { status: JobStatus.CANCELLED },
      });
    });

    it('should delete a DRAFT job successfully', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(sampleJob); // DRAFT
      prismaMock.jobPost.delete.mockResolvedValue(sampleJob);

      const res = await jobService.deleteJob('user-emp-1', 'job-201');
      expect(res.success).toBe(true);
      expect(prismaMock.jobPost.delete).toHaveBeenCalledWith({
        where: { id: 'job-201' },
      });
    });

    it('should reject deleting a PUBLISHED job with BadRequestException', async () => {
      const publishedJob = { ...sampleJob, status: JobStatus.PUBLISHED };
      prismaMock.jobPost.findFirst.mockResolvedValue(publishedJob);

      await expect(jobService.deleteJob('user-emp-1', 'job-201')).rejects.toThrow(
        BadRequestException
      );
      expect(prismaMock.jobPost.delete).not.toHaveBeenCalled();
    });
  });
});

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  DEMO_WORKER,
  DEMO_EMPLOYER,
  DEMO_ADMIN,
  DEMO_WORKER_PROFILE,
  DEMO_EMPLOYER_PROFILE,
  DEMO_JOBS,
  DEMO_BOOKINGS,
  DEMO_NOTIFICATIONS,
} from '@/lib/serverless-data';
import prisma from '@/lib/prisma';
import { createJobSchema } from '@/validation/job.schema';

export const runtime = 'nodejs';

const employerJobInclude = {
  jobRequiredSkills: { include: { skill: { select: { name: true, category: true } } } },
  jobLocation: true,
  employerProfile: { select: { businessName: true, businessType: true, locality: true, city: true, verificationState: true, totalJobsPosted: true } },
} as const;

async function getDemoEmployerProfile() {
  return prisma.employerProfile.findFirst({
    where: { user: { phone: DEMO_EMPLOYER.phone, role: 'EMPLOYER', deletedAt: null }, deletedAt: null },
  });
}

function toJobResponse(job: any) {
  return {
    ...job,
    wageAmount: Number(job.wageAmount),
    startDate: job.startDate instanceof Date ? job.startDate.toISOString().slice(0, 10) : job.startDate,
    requiredSkills: (job.jobRequiredSkills || []).map((item: any) => ({
      id: item.id,
      skillId: item.skillId,
      name: item.skill.name,
      category: item.skill.category,
      isRequired: item.isRequired,
      minExperienceYears: item.minExperienceYears,
    })),
    skillDetails: (job.jobRequiredSkills || []).map((item: any) => ({
      skillId: item.skillId,
      name: item.skill?.name || 'Skill',
      category: item.skill?.category || job.category || 'General',
      isRequired: item.isRequired,
      minExperienceYears: item.minExperienceYears || 1,
      workerHasSkill: true,
      workerProficiency: 'INTERMEDIATE',
      workerExperienceYears: 2,
      experienceMet: true,
    })),
    location: job.jobLocation || null,
    employer: job.employerProfile ? {
      businessName: job.employerProfile.businessName,
      businessType: job.employerProfile.businessType,
      locality: job.employerProfile.locality,
      city: job.employerProfile.city,
      verificationState: job.employerProfile.verificationState,
      totalJobsPosted: job.employerProfile.totalJobsPosted,
    } : {
      businessName: DEMO_EMPLOYER_PROFILE.businessName,
      businessType: DEMO_EMPLOYER_PROFILE.businessType,
      locality: DEMO_EMPLOYER_PROFILE.locality,
      city: DEMO_EMPLOYER_PROFILE.city,
      verificationState: 'VERIFIED',
      totalJobsPosted: 1,
    },
    distanceKm: 0,
    match: {
      eligible: true,
      score: 85,
      reasons: ['Recently posted by a local employer'],
      breakdown: {
        distanceKm: 0,
        effectiveRadiusKm: 30,
        distanceScore: 25,
        matchedSkillsCount: (job.jobRequiredSkills || []).length,
        totalRequiredSkillsCount: (job.jobRequiredSkills || []).length,
        skillCoveragePercentage: 100,
        skillScore: 35,
        experienceMet: true,
        experienceScore: 10,
        availabilityCompatible: true,
        availabilityReason: 'Listing available',
        availabilityScore: 5,
        wageCompatible: null,
        wageComparisonText: 'Wage provided by employer',
        wageScore: 10,
      },
    },
    jobRequiredSkills: undefined,
    jobLocation: undefined,
  };
}

const hasPersistentDatabase = () => Boolean(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);

function listRuntimeJobs(query: Record<string, string>, publishedOnly = false) {
  let jobs = [...runtimeJobs];
  if (publishedOnly) jobs = jobs.filter((job) => job.status === 'PUBLISHED');
  if (query.status) jobs = jobs.filter((job) => job.status === query.status);
  if (query.category) jobs = jobs.filter((job) => job.category?.toLowerCase() === query.category.toLowerCase());
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
  return {
    jobs: jobs.slice((page - 1) * limit, page * limit),
    total: jobs.length,
    page,
    limit,
    totalPages: Math.ceil(jobs.length / limit) || 1,
  };
}

// In-memory active OTP challenge store: phone -> { otp, expiresAt, role }
const activeOtpChallenges = new Map<string, { otp: string; expiresAt: number; role: string }>();

// Helper to parse query parameters
function parseQueryParams(req: NextRequest) {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// In-memory runtime state for active session mutations
let runtimeWorkerProfile: any = { ...DEMO_WORKER_PROFILE };
let runtimeJobs: any[] = [...DEMO_JOBS];
let runtimeBookings: any[] = [...DEMO_BOOKINGS];
let runtimeNotifications: any[] = [...DEMO_NOTIFICATIONS];
let runtimeApplications: any[] = [
  {
    id: 'app-demo-1',
    jobId: 'demo-job-1',
    jobTitle: 'Emergency Residential Pipe Replacement',
    jobCategory: 'Plumbing',
    employerBusinessName: 'Sharma Real Estate Solutions',
    employerLocality: 'Hazratganj',
    employerCity: 'Lucknow',
    workerId: 'worker-demo-1',
    workerName: 'Ramesh Kumar',
    workerPhone: '9123456780',
    workerRating: 4.8,
    status: 'APPLIED',
    wageType: 'DAILY',
    wageAmount: 900,
    jobStatus: 'PUBLISHED',
    appliedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    shortlistedAt: null,
    rejectedAt: null,
    acceptedAt: null,
    withdrawnAt: null,
    applicationMessage: 'Certified technician with 5 years experience, immediate availability with personal tools.',
    jobStartDate: 'Today',
    jobStartTime: '09:00',
    jobDurationDays: 1,
    jobUrgency: 'IMMEDIATE',
    distanceKm: 1.2,
  },
];

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugPath = (params.slug || []).join('/');
  const query = parseQueryParams(req);

  if (slugPath === 'employers/me/jobs') {
    if (!hasPersistentDatabase()) {
      const result = listRuntimeJobs(query);
      return NextResponse.json(result);
    }
    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) {
        return NextResponse.json(listRuntimeJobs(query));
      }
      const page = Math.max(1, Number(query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
      const where = { employerProfileId: employer.id, deletedAt: null, ...(query.status ? { status: query.status as any } : {}) };
      const [jobs, total] = await Promise.all([
        prisma.jobPost.findMany({ where, include: employerJobInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.jobPost.count({ where }),
      ]);
      return NextResponse.json({ jobs: jobs.map(toJobResponse), total, page, limit, totalPages: Math.ceil(total / limit) || 1 });
    } catch (error) {
      console.warn('Database query failed for employers/me/jobs, using runtime jobs:', error);
      return NextResponse.json(listRuntimeJobs(query));
    }
  }

  if (slugPath.startsWith('employers/me/jobs/')) {
    const jobId = slugPath.split('/')[3];
    if (!hasPersistentDatabase()) {
      const job = runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0];
      return NextResponse.json(job);
    }
    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) {
        const job = runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0];
        return NextResponse.json(job);
      }
      const job = await prisma.jobPost.findFirst({ where: { id: jobId, employerProfileId: employer.id, deletedAt: null }, include: employerJobInclude });
      return job ? NextResponse.json(toJobResponse(job)) : NextResponse.json(runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0]);
    } catch (error) {
      console.warn('Database query failed for employers/me/jobs/:id, using runtime job:', error);
      const job = runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0];
      return NextResponse.json(job);
    }
  }

  // 1. Auth & Current User
  if (slugPath === 'auth/me') {
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.includes('employer')) {
      return NextResponse.json(DEMO_EMPLOYER);
    }
    if (authHeader.includes('admin')) {
      return NextResponse.json(DEMO_ADMIN);
    }
    return NextResponse.json(DEMO_WORKER);
  }

  // 2. Worker Operations
  if (slugPath === 'workers/me') {
    return NextResponse.json(runtimeWorkerProfile);
  }
  if (slugPath === 'workers/me/skills') {
    return NextResponse.json(runtimeWorkerProfile.skills);
  }
  if (slugPath === 'workers/me/location') {
    return NextResponse.json(runtimeWorkerProfile.location);
  }
  if (slugPath === 'workers/me/availability') {
    return NextResponse.json(runtimeWorkerProfile.availability);
  }
  if (slugPath === 'workers/me/completion') {
    return NextResponse.json(runtimeWorkerProfile.completion);
  }

  // Worker application for specific job: GET /workers/me/jobs/:jobId/application
  if (slugPath.startsWith('workers/me/jobs/') && slugPath.endsWith('/application')) {
    const jobId = slugPath.replace('workers/me/jobs/', '').replace('/application', '');
    const application = runtimeApplications.find((a) => a.jobId === jobId);
    if (!application) {
      return NextResponse.json({ message: 'No application found' }, { status: 404 });
    }
    return NextResponse.json(application);
  }

  if (slugPath === 'workers/me/jobs' || slugPath === 'workers/me/jobs/nearby') {
    if (!hasPersistentDatabase()) {
      const result = listRuntimeJobs(query, true);
      return NextResponse.json({
        items: result.jobs,
        pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages, hasNextPage: result.page < result.totalPages },
      });
    }
    try {
      const page = Math.max(1, Number(query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
      const where = { status: 'PUBLISHED' as const, deletedAt: null, ...(query.category ? { category: { equals: query.category, mode: 'insensitive' as const } } : {}) };
      const [jobs, total] = await Promise.all([
        prisma.jobPost.findMany({ where, include: employerJobInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.jobPost.count({ where }),
      ]);
      return NextResponse.json({
        items: jobs.map(toJobResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasNextPage: page * limit < total },
      });
    } catch (error) {
      console.warn('Database query failed for workers/me/jobs, using runtime jobs:', error);
      const result = listRuntimeJobs(query, true);
      return NextResponse.json({
        items: result.jobs,
        pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages, hasNextPage: result.page < result.totalPages },
      });
    }
  }

  if (slugPath.startsWith('workers/jobs/') || slugPath.startsWith('workers/me/jobs/')) {
    const jobId = slugPath.startsWith('workers/jobs/')
      ? slugPath.replace('workers/jobs/', '')
      : slugPath.replace('workers/me/jobs/', '');
    if (!hasPersistentDatabase()) {
      const job = runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0];
      return NextResponse.json(job);
    }
    try {
      const job = await prisma.jobPost.findFirst({ where: { id: jobId, deletedAt: null }, include: employerJobInclude });
      return job ? NextResponse.json(toJobResponse(job)) : NextResponse.json(runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0]);
    } catch (error) {
      console.warn('Database query failed for workers/jobs/:id, using runtime job:', error);
      const job = runtimeJobs.find((item) => item.id === jobId) || runtimeJobs[0];
      return NextResponse.json(job);
    }
  }

  // 3. Trade Catalog
  if (slugPath === 'skills/catalog') {
    const catalog = [
      { id: 's-1', name: 'Pipe Fitting & Welding', category: 'Plumbing', description: 'Fitting and fixing residential & commercial pipes' },
      { id: 's-2', name: 'Bathroom Valve Repair', category: 'Plumbing', description: 'Repairing fixtures, mixers and flush valves' },
      { id: 's-3', name: 'Water Tank Installation', category: 'Plumbing', description: 'Installing loft and overhead water tanks' },
      { id: 's-4', name: 'Electrical Wiring', category: 'Electrical', description: 'Domestic & commercial conduit wiring' },
      { id: 's-5', name: 'MCB & Distribution Boards', category: 'Electrical', description: 'Circuit breaker boards & surge protection' },
      { id: 's-6', name: 'Cabinet Carpentry', category: 'Carpentry', description: 'Modular kitchen & wooden wardrobes' },
      { id: 's-7', name: 'Tile & Marble Laying', category: 'Masonry', description: 'Floor and bathroom tile setting' },
      { id: 's-8', name: 'Interior Wall Painting', category: 'Painting', description: 'Emulsion primer and putty application' },
    ];
    return NextResponse.json(catalog);
  }

  // 4. Employer Operations
  if (slugPath === 'employers/me') {
    return NextResponse.json(DEMO_EMPLOYER_PROFILE);
  }
  if (slugPath === 'employers/me/completion') {
    return NextResponse.json(DEMO_EMPLOYER_PROFILE.completion);
  }
  if (slugPath === 'employers/me/dashboard') {
    return NextResponse.json({
      profile: DEMO_EMPLOYER_PROFILE,
      completion: DEMO_EMPLOYER_PROFILE.completion,
      activeJobsCount: runtimeJobs.length,
      totalJobsCount: runtimeJobs.length + 3,
      totalApplicationsCount: 14,
      pendingApplicationsCount: 4,
      shortlistedApplicationsCount: 2,
      acceptedApplicationsCount: 1,
      stats: {
        activeJobsCount: runtimeJobs.length,
        totalApplicationsReceived: 14,
        confirmedBookingsCount: runtimeBookings.length,
        totalSpentInr: 28400,
      },
      recentJobs: runtimeJobs,
      activeBookings: runtimeBookings,
    });
  }

  // 5. Jobs List
  if (slugPath === 'jobs') {
    return NextResponse.json({
      items: runtimeJobs,
      total: runtimeJobs.length,
      page: Number(query.page || 1),
      limit: Number(query.limit || 10),
    });
  }
  if (slugPath.startsWith('jobs/') && !slugPath.includes('/applications')) {
    const jobId = slugPath.replace('jobs/', '');
    const job = runtimeJobs.find((j) => j.id === jobId) || runtimeJobs[0];
    return NextResponse.json(job);
  }

  // 6. Applications & Bookings
  if (slugPath === 'applications/worker' || slugPath === 'applications/employer') {
    return NextResponse.json({ items: runtimeApplications, total: runtimeApplications.length, page: 1, limit: 10 });
  }
  if (slugPath.includes('bookings')) {
    return NextResponse.json({
      items: runtimeBookings,
      total: runtimeBookings.length,
      page: 1,
      limit: 10,
    });
  }

  // 7. Notifications
  if (slugPath === 'notifications') {
    return NextResponse.json({
      items: runtimeNotifications,
      total: runtimeNotifications.length,
      page: 1,
      limit: 20,
    });
  }
  if (slugPath === 'notifications/unread-count') {
    const unread = runtimeNotifications.filter((n) => !n.isRead).length;
    return NextResponse.json({ unreadCount: unread });
  }
  if (slugPath === 'notifications/preferences') {
    return NextResponse.json({
      inApp: true,
      sms: true,
      whatsapp: true,
      email: false,
    });
  }

  // 8. Messaging & Conversations
  if (slugPath === 'conversations') {
    return NextResponse.json({ items: [], total: 0 });
  }
  if (slugPath === 'messaging/unread-count') {
    return NextResponse.json({ unreadCount: 0 });
  }

  // 9. Payments & Payouts
  if (slugPath === 'payments') {
    return NextResponse.json({ items: [], total: 0, page: 1, limit: 10 });
  }
  if (slugPath === 'payouts') {
    return NextResponse.json([]);
  }
  if (slugPath === 'reconciliation/report') {
    return NextResponse.json({
      period: 'October 2026',
      totalDisbursed: 14200,
      totalCollected: 16000,
      discrepancies: 0,
    });
  }

  // 10. Admin Endpoints
  if (slugPath === 'admin/overview') {
    return NextResponse.json({
      totalUsers: 1420,
      activeWorkers: 980,
      activeEmployers: 440,
      totalJobs: 320,
      totalBookings: 290,
      totalGrossValueInr: 428000,
      systemUptimePercent: 99.98,
    });
  }
  if (slugPath.startsWith('admin/')) {
    return NextResponse.json({
      data: [],
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      metrics: { total: 0 },
    });
  }

  // 11. Health
  if (slugPath === 'health') {
    return NextResponse.json({
      status: 'healthy',
      mode: 'serverless-vercel-free',
      timestamp: new Date().toISOString(),
    });
  }

  // Fallback for any other GET endpoint
  return NextResponse.json({
    success: true,
    data: [],
    path: slugPath,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugPath = (params.slug || []).join('/');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Worker apply to job: POST /workers/me/jobs/:jobId/applications
  if (slugPath.startsWith('workers/me/jobs/') && slugPath.endsWith('/applications')) {
    const jobId = slugPath.replace('workers/me/jobs/', '').replace('/applications', '');
    const targetJob = runtimeJobs.find((j) => j.id === jobId) || runtimeJobs[0];
    const newApp = {
      id: `app-${Date.now()}`,
      jobId,
      jobTitle: targetJob.title,
      jobCategory: targetJob.category,
      employerBusinessName: targetJob.employer?.businessName || 'Employer',
      employerLocality: targetJob.location?.locality || null,
      employerCity: targetJob.location?.city || null,
      wageType: targetJob.wageType,
      wageAmount: targetJob.wageAmount,
      jobStatus: targetJob.status,
      status: 'APPLIED',
      appliedAt: new Date().toISOString(),
      shortlistedAt: null,
      rejectedAt: null,
      acceptedAt: null,
      withdrawnAt: null,
      applicationMessage: body.message || null,
      jobStartDate: targetJob.startDate,
      jobStartTime: targetJob.startTime || null,
      jobDurationDays: targetJob.durationDays,
      jobUrgency: targetJob.urgency,
      jobLocation: targetJob.location,
      distanceKm: targetJob.distanceKm || 1.2,
      matchBreakdown: targetJob.match?.breakdown || null,
      matchReasons: targetJob.match?.reasons || [],
    };
    runtimeApplications = runtimeApplications.filter((a) => a.jobId !== jobId);
    runtimeApplications.unshift(newApp);
    return NextResponse.json(newApp, { status: 201 });
  }

  // Withdraw Application: POST /applications/:applicationId/withdraw
  if (slugPath.startsWith('applications/') && slugPath.endsWith('/withdraw')) {
    const appId = slugPath.split('/')[1];
    const existing = runtimeApplications.find((a) => a.id === appId);
    if (existing) {
      existing.status = 'WITHDRAWN';
      existing.withdrawnAt = new Date().toISOString();
      return NextResponse.json(existing);
    }
    return NextResponse.json({
      id: appId,
      status: 'WITHDRAWN',
      withdrawnAt: new Date().toISOString(),
    });
  }

  if (slugPath === 'employers/me/jobs') {
    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }, { status: 400 });
    }
    const createRuntimeJob = () => {
      const now = new Date().toISOString();
      const data = parsed.data;
      const id = `demo-job-${Date.now()}`;
      const newJob = {
        id,
        employerProfileId: 'employer-demo-1',
        title: data.title,
        description: data.description,
        category: data.category,
        status: 'DRAFT',
        urgency: data.urgency,
        wageType: data.wageType,
        wageAmount: data.wageAmount,
        workerCount: data.workerCount,
        durationDays: data.durationDays,
        startDate: data.startDate,
        startTime: data.startTime ?? null,
        requirements: data.requirements,
        languageRequirements: data.languageRequirements,
        publishedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        location: data.location ? { ...data.location, id: `demo-location-${id}`, jobPostId: id, addressLine: data.location.addressLine ?? null } : null,
        employer: {
          id: 'employer-demo-1',
          businessName: DEMO_EMPLOYER_PROFILE.businessName,
          businessType: DEMO_EMPLOYER_PROFILE.businessType,
          locality: DEMO_EMPLOYER_PROFILE.locality,
          city: DEMO_EMPLOYER_PROFILE.city,
          verificationState: 'VERIFIED',
          totalJobsPosted: 1,
        },
        distanceKm: 0,
        match: {
          eligible: true,
          score: 85,
          reasons: ['Recently posted by a local employer'],
          breakdown: {
            distanceKm: 0,
            effectiveRadiusKm: 30,
            distanceScore: 25,
            matchedSkillsCount: (data.skills || []).length,
            totalRequiredSkillsCount: (data.skills || []).length,
            skillCoveragePercentage: 100,
            skillScore: 35,
            experienceMet: true,
            experienceScore: 10,
            availabilityCompatible: true,
            availabilityReason: 'Demo listing',
            availabilityScore: 5,
            wageCompatible: null,
            wageComparisonText: 'Wage provided by employer',
            wageScore: 10,
          },
        },
        requiredSkills: (data.skills || []).map((skill, index) => ({
          id: `demo-skill-${id}-${index}`,
          skillId: skill.skillId || `demo-skill-${index}`,
          name: skill.name || 'Trade Skill',
          category: data.category,
          isRequired: skill.isRequired,
          minExperienceYears: skill.minExperienceYears,
        })),
        skillDetails: (data.skills || []).map((skill, index) => ({
          skillId: skill.skillId || `demo-skill-${index}`,
          name: skill.name || 'Trade Skill',
          category: data.category,
          isRequired: skill.isRequired,
          minExperienceYears: skill.minExperienceYears,
          workerHasSkill: true,
          workerProficiency: 'INTERMEDIATE',
          workerExperienceYears: 2,
          experienceMet: true,
        })),
      };
      runtimeJobs.unshift(newJob);
      return newJob;
    };

    if (!hasPersistentDatabase()) {
      return NextResponse.json(createRuntimeJob(), { status: 201 });
    }

    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) {
        return NextResponse.json(createRuntimeJob(), { status: 201 });
      }
      const data = parsed.data;
      const skills = await Promise.all((data.skills || []).map(async (skill) => {
        if (skill.skillId) return { skillId: skill.skillId, isRequired: skill.isRequired, minExperienceYears: skill.minExperienceYears };
        const normalizedName = skill.name!.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const record = await prisma.skill.upsert({ where: { normalizedName }, update: {}, create: { name: skill.name!.trim(), normalizedName, category: data.category, isActive: true } });
        return { skillId: record.id, isRequired: skill.isRequired, minExperienceYears: skill.minExperienceYears };
      }));
      const job = await prisma.$transaction(async (tx) => {
        const created = await tx.jobPost.create({
          data: {
            employerProfileId: employer.id,
            title: data.title,
            description: data.description,
            category: data.category,
            wageType: data.wageType,
            wageAmount: data.wageAmount,
            workerCount: data.workerCount,
            durationDays: data.durationDays,
            startDate: new Date(`${data.startDate}T00:00:00.000Z`),
            startTime: data.startTime,
            urgency: data.urgency,
            requirements: data.requirements,
            languageRequirements: data.languageRequirements,
            jobRequiredSkills: { create: skills },
            ...(data.location ? { jobLocation: { create: data.location } } : {}),
          },
          include: employerJobInclude,
        });
        await tx.employerProfile.update({ where: { id: employer.id }, data: { totalJobsPosted: { increment: 1 } } });
        return created;
      });
      return NextResponse.json(toJobResponse(job), { status: 201 });
    } catch (error) {
      console.warn('Database create failed for employers/me/jobs, using runtime job creation:', error);
      return NextResponse.json(createRuntimeJob(), { status: 201 });
    }
  }

  const jobAction = slugPath.match(/^employers\/me\/jobs\/([^/]+)\/(publish|pause|resume|fill|close)$/);
  if (jobAction) {
    const [, jobId, action] = jobAction;
    const statusByAction = { publish: 'PUBLISHED', pause: 'PAUSED', resume: 'PUBLISHED', fill: 'FILLED', close: 'CANCELLED' } as const;
    const updateRuntimeJob = () => {
      const job = runtimeJobs.find((item) => item.id === jobId);
      if (!job) return null;
      job.status = statusByAction[action as keyof typeof statusByAction];
      job.publishedAt = job.status === 'PUBLISHED' ? new Date().toISOString() : null;
      job.updatedAt = new Date().toISOString();
      return job;
    };

    if (!hasPersistentDatabase()) {
      const job = updateRuntimeJob();
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }

    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) {
        const job = updateRuntimeJob();
        return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      }
      const updated = await prisma.jobPost.updateMany({
        where: { id: jobId, employerProfileId: employer.id, deletedAt: null },
        data: {
          status: statusByAction[action as keyof typeof statusByAction],
          ...(action === 'publish' || action === 'resume' ? { publishedAt: new Date() } : {}),
        },
      });
      if (!updated.count) {
        const job = updateRuntimeJob();
        return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      }
      const job = await prisma.jobPost.findUnique({ where: { id: jobId }, include: employerJobInclude });
      return NextResponse.json(toJobResponse(job));
    } catch (error) {
      console.warn(`Failed to ${action} employer job in DB, using runtime update:`, error);
      const job = updateRuntimeJob();
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
  }

  // 1. Auth OTP Request
  if (slugPath === 'auth/otp/request') {
    const rawPhone = body.phone ? String(body.phone).replace(/\D/g, '') : '';
    const phone = rawPhone.length >= 10 ? rawPhone.slice(-10) : '9123456780';
    const role = body.role || 'WORKER';

    const dynamicOtp = crypto.randomInt(100000, 1000000).toString();
    activeOtpChallenges.set(phone, {
      otp: dynamicOtp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      role,
    });

    return NextResponse.json({
      success: true,
      message: `[Dev Mode] Verification code is: ${dynamicOtp}`,
    });
  }

  // 2. Auth OTP Verify
  if (slugPath === 'auth/otp/verify') {
    const role = body.role || 'WORKER';
    const rawPhone = body.phone ? String(body.phone).replace(/\D/g, '') : '';
    const phone = rawPhone.length >= 10 ? rawPhone.slice(-10) : '9123456780';
    const submittedOtp = String(body.otp || '').trim();

    const challenge = activeOtpChallenges.get(phone);
    const isValid = !challenge || challenge.otp === submittedOtp || submittedOtp === '123456';
    if (!isValid) {
      return NextResponse.json(
        { message: 'Invalid verification code. Please enter the latest 6-digit OTP received.' },
        { status: 400 }
      );
    }

    let user = { ...DEMO_WORKER, phone: phone || DEMO_WORKER.phone };
    if (role === 'EMPLOYER') user = { ...DEMO_EMPLOYER, phone: phone || DEMO_EMPLOYER.phone };
    if (role === 'ADMIN') user = { ...DEMO_ADMIN, phone: phone || DEMO_ADMIN.phone };

    return NextResponse.json({
      accessToken: `saathi-jwt-${role.toLowerCase()}-${Date.now()}`,
      user,
    });
  }

  // 3. Auth Logout
  if (slugPath === 'auth/logout') {
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  // 4. Worker Skills & Onboarding
  if (slugPath === 'workers/me/skills') {
    const newSkill = {
      skillId: `s-${Date.now()}`,
      name: body.name || 'Trade Skill',
      category: body.category || 'General',
      experienceYears: body.experienceYears || 2,
      isPrimary: Boolean(body.isPrimary),
    };
    runtimeWorkerProfile.skills.push(newSkill);
    return NextResponse.json(newSkill, { status: 201 });
  }

  if (slugPath === 'workers/me/onboarding/complete') {
    runtimeWorkerProfile.completion = {
      completionPercentage: 100,
      missingFields: [],
      isComplete: true,
    };
    return NextResponse.json({
      success: true,
      message: 'Worker profile onboarding completed successfully',
    });
  }

  // 5. Job Creation
  if (slugPath === 'jobs') {
    const newJob = {
      id: `job-${Date.now()}`,
      title: body.title || 'Untitled Trade Job',
      description: body.description || '',
      category: body.category || 'General',
      status: 'PUBLISHED',
      urgency: body.urgency || 'MEDIUM',
      wageType: body.wageType || 'DAILY',
      wageAmount: body.wageAmount || 800,
      workerCount: body.workerCount || 1,
      durationDays: body.durationDays || 1,
      startDate: body.startDate || 'Immediate',
      startTime: body.startTime || '09:00',
      requirements: body.requirements || [],
      languageRequirements: body.languageRequirements || ['hi'],
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      location: body.location || runtimeWorkerProfile.location,
      employer: {
        id: 'emp-custom',
        businessName: body.businessName || 'Local Contractor',
        businessType: 'Contractor',
        rating: 5.0,
        totalReviews: 1,
      },
      requiredSkills: body.requiredSkills || [],
      skillDetails: (body.requiredSkills || []).map((s: any) => ({
        skillId: s.skillId || `s-${Date.now()}`,
        name: s.name || 'Skill',
        category: s.category || body.category || 'General',
        isRequired: Boolean(s.isRequired),
        minExperienceYears: s.minExperienceYears || 1,
        workerHasSkill: true,
        workerProficiency: 'INTERMEDIATE',
        workerExperienceYears: 2,
        experienceMet: true,
      })),
      distanceKm: 2.0,
      match: {
        score: 95,
        eligible: true,
        reasons: ['Newly posted nearby job'],
        breakdown: {
          distanceKm: 2.0,
          effectiveRadiusKm: 10,
          distanceScore: 90,
          matchedSkillsCount: (body.requiredSkills || []).length,
          totalRequiredSkillsCount: (body.requiredSkills || []).length,
          skillCoveragePercentage: 100,
          skillScore: 95,
          experienceMet: true,
          experienceScore: 90,
          availabilityCompatible: true,
          availabilityReason: 'Immediate availability',
          availabilityScore: 95,
          wageCompatible: true,
          wageComparisonText: 'Meets expectation',
          wageScore: 95,
        },
      },
    };
    runtimeJobs.unshift(newJob);
    return NextResponse.json(newJob, { status: 201 });
  }

  // 6. Job Apply
  if (slugPath.endsWith('/apply')) {
    const jobId = slugPath.split('/')[1];
    return NextResponse.json({
      success: true,
      applicationId: `app-${Date.now()}`,
      jobId,
      status: 'SUBMITTED',
      message: 'Application submitted successfully to employer',
    });
  }

  // 7. Booking Confirm / Complete / Cancel
  if (slugPath.includes('bookings')) {
    return NextResponse.json({
      id: `booking-${Date.now()}`,
      status: 'CONFIRMED',
      updatedAt: new Date().toISOString(),
      message: 'Booking state updated successfully',
    });
  }

  // 8. Notifications Read All
  if (slugPath === 'notifications/read-all') {
    runtimeNotifications = runtimeNotifications.map((n) => ({ ...n, isRead: true }));
    return NextResponse.json({ success: true, count: runtimeNotifications.length });
  }

  // Fallback for POST
  return NextResponse.json({
    success: true,
    message: 'Operation executed successfully',
    data: body,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugPath = (params.slug || []).join('/');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Update Worker Location
  if (slugPath === 'workers/me/location') {
    runtimeWorkerProfile.location = {
      locality: body.locality || runtimeWorkerProfile.location.locality,
      city: body.city || runtimeWorkerProfile.location.city,
      state: body.state || runtimeWorkerProfile.location.state,
      pinCode: body.pinCode || runtimeWorkerProfile.location.pinCode,
      addressLine: body.addressLine || runtimeWorkerProfile.location.addressLine,
      latitude: body.latitude || runtimeWorkerProfile.location.latitude,
      longitude: body.longitude || runtimeWorkerProfile.location.longitude,
    };
    return NextResponse.json(runtimeWorkerProfile.location);
  }

  return NextResponse.json({ success: true, data: body });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugPath = (params.slug || []).join('/');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const employerJobId = slugPath.match(/^employers\/me\/jobs\/([^/]+)$/)?.[1];
  if (employerJobId) {
    const updateRuntimeJob = () => {
      const job = runtimeJobs.find((item) => item.id === employerJobId);
      if (!job) return null;
      Object.assign(job, body, { updatedAt: new Date().toISOString() });
      return job;
    };

    if (!hasPersistentDatabase()) {
      const job = updateRuntimeJob();
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }

    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) {
        const job = updateRuntimeJob();
        return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      }
      const data: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'category', 'wageType', 'wageAmount', 'workerCount', 'durationDays', 'startTime', 'urgency', 'requirements', 'languageRequirements']) {
        if (body[key] !== undefined) data[key] = body[key];
      }
      if (body.startDate) data.startDate = new Date(`${body.startDate}T00:00:00.000Z`);
      const updated = await prisma.jobPost.updateMany({ where: { id: employerJobId, employerProfileId: employer.id, deletedAt: null }, data: data as any });
      if (!updated.count) {
        const job = updateRuntimeJob();
        return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      }
      const job = await prisma.jobPost.findUnique({ where: { id: employerJobId }, include: employerJobInclude });
      return NextResponse.json(toJobResponse(job));
    } catch (error) {
      console.warn('Failed to update employer job in DB, using runtime update:', error);
      const job = updateRuntimeJob();
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
  }

  if (slugPath === 'workers/me') {
    runtimeWorkerProfile = { ...runtimeWorkerProfile, ...body };
    return NextResponse.json(runtimeWorkerProfile);
  }

  if (slugPath.startsWith('notifications/') && slugPath.endsWith('/read')) {
    const id = slugPath.split('/')[1];
    runtimeNotifications = runtimeNotifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    );
    return NextResponse.json({ success: true, id, isRead: true });
  }

  return NextResponse.json({ success: true, data: body });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugPath = (params.slug || []).join('/');
  const employerJobId = slugPath.match(/^employers\/me\/jobs\/([^/]+)$/)?.[1];
  if (employerJobId) {
    const deleteRuntimeJob = () => {
      const exists = runtimeJobs.some((job) => job.id === employerJobId);
      runtimeJobs = runtimeJobs.filter((job) => job.id !== employerJobId);
      return exists;
    };

    if (!hasPersistentDatabase()) {
      const exists = deleteRuntimeJob();
      return exists
        ? NextResponse.json({ success: true })
        : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }

    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) {
        const exists = deleteRuntimeJob();
        return exists
          ? NextResponse.json({ success: true })
          : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      }
      const deleted = await prisma.jobPost.updateMany({ where: { id: employerJobId, employerProfileId: employer.id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (!deleted.count) {
        const exists = deleteRuntimeJob();
        return exists
          ? NextResponse.json({ success: true })
          : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      console.warn('Failed to delete employer job in DB, using runtime delete:', error);
      const exists = deleteRuntimeJob();
      return exists
        ? NextResponse.json({ success: true })
        : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Resource deleted at ${slugPath}`,
  });
}

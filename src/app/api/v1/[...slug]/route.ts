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
  // The bundled OTP flow issues demo tokens, so resolve the seeded demo account
  // by its phone number instead of using the non-UUID demo ID as a DB foreign key.
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
        distanceKm: 0, effectiveRadiusKm: 30, distanceScore: 25,
        matchedSkillsCount: (job.jobRequiredSkills || []).length,
        totalRequiredSkillsCount: (job.jobRequiredSkills || []).length,
        skillCoveragePercentage: 100, skillScore: 35, experienceMet: true,
        experienceScore: 10, availabilityCompatible: true, availabilityReason: 'Listing available',
        availabilityScore: 5, wageCompatible: null, wageComparisonText: 'Wage provided by employer', wageScore: 10,
      },
    },
    jobRequiredSkills: undefined,
    jobLocation: undefined,
  };
}

function databaseUnavailable() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
  return NextResponse.json(
    {
      message: hasDatabaseUrl
        ? 'Job database is unavailable. Check the Vercel database connection, apply Prisma migrations, and seed the demo employer.'
        : 'Job posting needs a persistent Postgres database. Add DATABASE_URL and DATABASE_URL_POOLED to this Vercel project, then redeploy.',
    },
    { status: 503 },
  );
}

const hasPersistentDatabase = () => Boolean(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);

function listRuntimeJobs(query: Record<string, string>, publishedOnly = false) {
  let jobs = [...runtimeJobs];
  if (publishedOnly) jobs = jobs.filter((job) => job.status === 'PUBLISHED');
  if (query.status) jobs = jobs.filter((job) => job.status === query.status);
  if (query.category) jobs = jobs.filter((job) => job.category?.toLowerCase() === query.category.toLowerCase());
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
  return { jobs: jobs.slice((page - 1) * limit, page * limit), total: jobs.length, page, limit, totalPages: Math.ceil(jobs.length / limit) || 1 };
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
let runtimeWorkerProfile = { ...DEMO_WORKER_PROFILE };
let runtimeJobs: any[] = [...DEMO_JOBS];
let runtimeBookings = [...DEMO_BOOKINGS];
let runtimeNotifications = [...DEMO_NOTIFICATIONS];

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
      if (!employer) return NextResponse.json({ message: 'Employer account is not seeded in the database.' }, { status: 404 });
      const page = Math.max(1, Number(query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
      const where = { employerProfileId: employer.id, deletedAt: null, ...(query.status ? { status: query.status as any } : {}) };
      const [jobs, total] = await Promise.all([
        prisma.jobPost.findMany({ where, include: employerJobInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.jobPost.count({ where }),
      ]);
      return NextResponse.json({ jobs: jobs.map(toJobResponse), total, page, limit, totalPages: Math.ceil(total / limit) || 1 });
    } catch (error) {
      console.error('Failed to list employer jobs:', error);
      return databaseUnavailable();
    }
  }
  if (slugPath.startsWith('employers/me/jobs/')) {
    const jobId = slugPath.split('/')[3];
    if (!hasPersistentDatabase()) {
      const job = runtimeJobs.find((item) => item.id === jobId);
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) return NextResponse.json({ message: 'Employer account is not seeded in the database.' }, { status: 404 });
      const job = await prisma.jobPost.findFirst({ where: { id: jobId, employerProfileId: employer.id, deletedAt: null }, include: employerJobInclude });
      return job ? NextResponse.json(toJobResponse(job)) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    } catch (error) {
      console.error('Failed to get employer job:', error);
      return databaseUnavailable();
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
      console.error('Failed to list published jobs:', error);
      return databaseUnavailable();
    }
  }
  if (slugPath.startsWith('workers/me/jobs/')) {
    const jobId = slugPath.replace('workers/me/jobs/', '');
    if (!hasPersistentDatabase()) {
      const job = runtimeJobs.find((item) => item.id === jobId && item.status === 'PUBLISHED');
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
    try {
      const job = await prisma.jobPost.findFirst({ where: { id: jobId, status: 'PUBLISHED', deletedAt: null }, include: employerJobInclude });
      return job ? NextResponse.json(toJobResponse(job)) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    } catch (error) {
      console.error('Failed to load published job:', error);
      return databaseUnavailable();
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
    if (!hasPersistentDatabase()) {
      const result = listRuntimeJobs(query, true);
      return NextResponse.json({ items: result.jobs, total: result.total, page: result.page, limit: result.limit });
    }
    try {
      const page = Math.max(1, Number(query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
      const where = { status: 'PUBLISHED' as const, deletedAt: null };
      const [jobs, total] = await Promise.all([
        prisma.jobPost.findMany({ where, include: employerJobInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.jobPost.count({ where }),
      ]);
      return NextResponse.json({ items: jobs.map(toJobResponse), total, page, limit });
    } catch (error) {
      console.error('Failed to list public jobs:', error);
      return databaseUnavailable();
    }
  }
  if (slugPath.startsWith('jobs/') && !slugPath.includes('/applications')) {
    const jobId = slugPath.replace('jobs/', '');
    if (!hasPersistentDatabase()) {
      const job = runtimeJobs.find((item) => item.id === jobId && item.status === 'PUBLISHED');
      return job ? NextResponse.json(job) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
    try {
      const job = await prisma.jobPost.findFirst({ where: { id: jobId, status: 'PUBLISHED', deletedAt: null }, include: employerJobInclude });
      return job ? NextResponse.json(toJobResponse(job)) : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    } catch (error) {
      console.error('Failed to load public job:', error);
      return databaseUnavailable();
    }
  }

  // 6. Applications & Bookings
  if (slugPath === 'applications/worker' || slugPath === 'applications/employer') {
    const apps = [
      {
        id: 'app-demo-1',
        jobId: 'demo-job-1',
        jobTitle: 'Emergency Residential Pipe Replacement',
        workerId: 'worker-demo-1',
        workerName: 'Ramesh Kumar',
        workerPhone: '9123456780',
        workerRating: 4.8,
        status: 'ACCEPTED',
        appliedAt: new Date().toISOString(),
        distanceKm: 1.2,
      },
    ];
    return NextResponse.json({ items: apps, total: apps.length, page: 1, limit: 10 });
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

  if (slugPath === 'employers/me/jobs') {
    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }, { status: 400 });
    }
    try {
      if (!hasPersistentDatabase()) {
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
        };
        runtimeJobs.unshift(newJob);
        return NextResponse.json(newJob, { status: 201 });
      }
      const employer = await getDemoEmployerProfile();
      if (!employer) return NextResponse.json({ message: 'Employer account is not seeded in the database.' }, { status: 404 });
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
      console.error('Failed to create employer job:', error);
      return databaseUnavailable();
    }
  }
  const jobAction = slugPath.match(/^employers\/me\/jobs\/([^/]+)\/(publish|pause|resume|fill|close)$/);
  if (jobAction) {
    const [, jobId, action] = jobAction;
    const statusByAction = { publish: 'PUBLISHED', pause: 'PAUSED', resume: 'PUBLISHED', fill: 'FILLED', close: 'CANCELLED' } as const;
    try {
      if (!hasPersistentDatabase()) {
        const job = runtimeJobs.find((item) => item.id === jobId);
        if (!job) return NextResponse.json({ message: 'Job not found.' }, { status: 404 });
        job.status = statusByAction[action as keyof typeof statusByAction];
        job.publishedAt = job.status === 'PUBLISHED' ? new Date().toISOString() : null;
        job.updatedAt = new Date().toISOString();
        return NextResponse.json(job);
      }
      const employer = await getDemoEmployerProfile();
      if (!employer) return NextResponse.json({ message: 'Employer account is not seeded in the database.' }, { status: 404 });
      const updated = await prisma.jobPost.updateMany({
        where: { id: jobId, employerProfileId: employer.id, deletedAt: null },
        data: {
          status: statusByAction[action as keyof typeof statusByAction],
          ...(action === 'publish' || action === 'resume' ? { publishedAt: new Date() } : {}),
        },
      });
      if (!updated.count) return NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      const job = await prisma.jobPost.findUnique({ where: { id: jobId }, include: employerJobInclude });
      return NextResponse.json(toJobResponse(job));
    } catch (error) {
      console.error(`Failed to ${action} employer job:`, error);
      return databaseUnavailable();
    }
  }

  // 1. Auth OTP Request
  if (slugPath === 'auth/otp/request') {
    const rawPhone = body.phone ? String(body.phone).replace(/\D/g, '') : '';
    const phone = rawPhone.length >= 10 ? rawPhone.slice(-10) : '9123456780';
    const role = body.role || 'WORKER';

    // Generate dynamic, cryptographically secure 6-digit OTP code (different every request)
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
    // Validate submitted OTP matches the active challenge (or fallback 123456 for demo resilience)
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
      distanceKm: 2.0,
      match: {
        score: 95,
        reasons: ['Newly posted nearby job'],
        breakdown: { skillScore: 40, distanceScore: 35, ratingScore: 20, totalScore: 95 },
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
    if (!hasPersistentDatabase()) {
      const job = runtimeJobs.find((item) => item.id === employerJobId);
      if (!job) return NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      Object.assign(job, body, { updatedAt: new Date().toISOString() });
      return NextResponse.json(job);
    }
    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) return NextResponse.json({ message: 'Employer account is not seeded in the database.' }, { status: 404 });
      const data: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'category', 'wageType', 'wageAmount', 'workerCount', 'durationDays', 'startTime', 'urgency', 'requirements', 'languageRequirements']) {
        if (body[key] !== undefined) data[key] = body[key];
      }
      if (body.startDate) data.startDate = new Date(`${body.startDate}T00:00:00.000Z`);
      const updated = await prisma.jobPost.updateMany({ where: { id: employerJobId, employerProfileId: employer.id, deletedAt: null }, data: data as any });
      if (!updated.count) return NextResponse.json({ message: 'Job not found.' }, { status: 404 });
      const job = await prisma.jobPost.findUnique({ where: { id: employerJobId }, include: employerJobInclude });
      return NextResponse.json(toJobResponse(job));
    } catch (error) {
      console.error('Failed to update employer job:', error);
      return databaseUnavailable();
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
    if (!hasPersistentDatabase()) {
      const exists = runtimeJobs.some((job) => job.id === employerJobId);
      runtimeJobs = runtimeJobs.filter((job) => job.id !== employerJobId);
      return exists
        ? NextResponse.json({ success: true })
        : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }
    try {
      const employer = await getDemoEmployerProfile();
      if (!employer) return NextResponse.json({ message: 'Employer account is not seeded in the database.' }, { status: 404 });
      const deleted = await prisma.jobPost.updateMany({ where: { id: employerJobId, employerProfileId: employer.id, deletedAt: null }, data: { deletedAt: new Date() } });
      return deleted.count
        ? NextResponse.json({ success: true })
        : NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    } catch (error) {
      console.error('Failed to delete employer job:', error);
      return databaseUnavailable();
    }
  }
  return NextResponse.json({
    success: true,
    message: `Resource deleted at ${slugPath}`,
  });
}

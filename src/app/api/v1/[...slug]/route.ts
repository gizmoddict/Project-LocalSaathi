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
import { FALLBACK_GEOCODING_DATABASE } from '@/lib/geocoding';

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

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
    location: job.jobLocation
      ? {
          ...job.jobLocation,
          latitude: Number(job.jobLocation.latitude || 26.8467),
          longitude: Number(job.jobLocation.longitude || 80.9462),
        }
      : job.location || {
          id: `fallback-loc-${job.id || 'default'}`,
          jobPostId: job.id || '',
          locality: job.employerProfile?.locality || 'Hazratganj',
          city: job.employerProfile?.city || 'Lucknow',
          state: 'Uttar Pradesh',
          pinCode: '226001',
          latitude: 26.8467,
          longitude: 80.9462,
        },
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
  if (query.minWage) jobs = jobs.filter((job) => Number(job.wageAmount) >= Number(query.minWage));

  const userLat = query.latitude ? Number(query.latitude) : null;
  const userLon = query.longitude ? Number(query.longitude) : null;
  const radiusKm = query.radiusKm ? Number(query.radiusKm) : null;

  if (userLat !== null && userLon !== null && !isNaN(userLat) && !isNaN(userLon)) {
    jobs = jobs.map((job) => {
      const jLat = job.location?.latitude ?? 26.85;
      const jLon = job.location?.longitude ?? 80.95;
      const dist = calculateDistanceKm(userLat, userLon, jLat, jLon);
      return {
        ...job,
        distanceKm: dist,
        match: {
          ...job.match,
          breakdown: {
            ...job.match?.breakdown,
            distanceKm: dist,
          },
        },
      };
    });

    if (radiusKm && radiusKm > 0) {
      jobs = jobs.filter((job) => job.distanceKm <= radiusKm);
    }

    if (query.sort === 'distance' || query.sort === 'DISTANCE_ASC') {
      jobs.sort((a, b) => a.distanceKm - b.distanceKm);
    }
  }
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

function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? national : null;
}

function authPepper(): string {
  return process.env.AUTH_PEPPER || process.env.JWT_ACCESS_SECRET || 'local-development-pepper-only';
}

function hashOtp(phone: string, otp: string): string {
  return crypto.createHmac('sha256', authPepper()).update(`${phone}:${otp}`).digest('hex');
}

function signAuthToken(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 });
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

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
  const slug = params.slug || [];
  const slugPath = slug.join('/');
  const query = parseQueryParams(req);

  // Geocoding Proxy (Server-to-Server, bypasses browser CORS & header restrictions)
  if (slugPath === 'geocoding/reverse') {
    const lat = query.lat || query.latitude;
    const lon = query.lon || query.longitude;
    if (!lat || !lon) {
      return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
    }
    const numLat = Number(lat);
    const numLon = Number(lon);

    try {
      const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${numLat}&lon=${numLon}`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LocalSaathi-Platform/1.0 (contact@localsaathi.in)',
        },
      });

      if (response.ok) {
        const item = await response.json();
        if (item && item.address) {
          const addr = item.address;
          const locality =
            addr.amenity ||
            addr.suburb ||
            addr.neighbourhood ||
            addr.residential ||
            addr.quarter ||
            addr.commercial ||
            addr.village ||
            addr.road ||
            'Local Area';
          const city =
            addr.city ||
            addr.town ||
            addr.state_district ||
            addr.county ||
            addr.city_district ||
            'Local Area';
          const state = addr.state || '';
          const pinCode = addr.postcode || '';
          const addressLine = addr.road || addr.amenity || locality;

          return NextResponse.json({
            latitude: numLat,
            longitude: numLon,
            displayName: item.display_name || `${locality}, ${city}, ${state}`,
            addressLine,
            locality,
            city,
            state,
            pinCode,
          });
        }
      }
    } catch (e) {
      console.warn('Server reverse geocode fetch failed:', e);
    }

    // Fallback: match known trade hubs
    let nearest: any = null;
    let minDist = Infinity;
    for (const hub of FALLBACK_GEOCODING_DATABASE) {
      const dLat = hub.latitude - numLat;
      const dLon = hub.longitude - numLon;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist < minDist) {
        minDist = dist;
        nearest = hub;
      }
    }

    if (nearest && minDist < 0.25) {
      return NextResponse.json({
        latitude: numLat,
        longitude: numLon,
        displayName: `${nearest.locality}, ${nearest.city}, ${nearest.state}`,
        addressLine: nearest.addressLine,
        locality: nearest.locality,
        city: nearest.city,
        state: nearest.state,
        pinCode: nearest.pinCode,
      });
    }

    return NextResponse.json({
      latitude: numLat,
      longitude: numLon,
      displayName: `Selected Location (${numLat.toFixed(4)}, ${numLon.toFixed(4)})`,
      locality: 'Selected Location',
      city: 'Local Area',
      state: '',
    });
  }

  if (slugPath === 'geocoding/search') {
    const q = query.q || query.query || '';
    if (!q.trim()) {
      return NextResponse.json([]);
    }
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=in&q=${encodeURIComponent(q)}&limit=5`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LocalSaathi-Platform/1.0 (contact@localsaathi.in)',
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const results = data.map((item: any) => {
            const addr = item.address || {};
            const locality =
              addr.amenity ||
              addr.suburb ||
              addr.neighbourhood ||
              addr.residential ||
              addr.quarter ||
              addr.commercial ||
              addr.village ||
              addr.road;
            const city =
              addr.city ||
              addr.town ||
              addr.state_district ||
              addr.county ||
              addr.city_district;
            return {
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
              displayName: item.display_name,
              addressLine: addr.road || addr.amenity || locality,
              locality,
              city,
              state: addr.state,
              pinCode: addr.postcode,
            };
          });
          return NextResponse.json(results);
        }
      }
    } catch (e) {
      console.warn('Server search places fetch failed:', e);
    }
    return NextResponse.json([]);
  }

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
    if (slugPath.includes('disputes')) {
      return NextResponse.json([]);
    }
    const isList =
      slugPath === 'employers/me/bookings' ||
      slugPath === 'workers/me/bookings' ||
      slugPath === 'bookings';

    if (isList) {
      const query = parseQueryParams(req);

  // Geocoding Proxy (Server-to-Server, bypasses browser CORS & header restrictions)
  if (slugPath === 'geocoding/reverse') {
    const lat = query.lat || query.latitude;
    const lon = query.lon || query.longitude;
    if (!lat || !lon) {
      return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
    }
    const numLat = Number(lat);
    const numLon = Number(lon);

    try {
      const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${numLat}&lon=${numLon}`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LocalSaathi-Platform/1.0 (contact@localsaathi.in)',
        },
      });

      if (response.ok) {
        const item = await response.json();
        if (item && item.address) {
          const addr = item.address;
          const locality =
            addr.amenity ||
            addr.suburb ||
            addr.neighbourhood ||
            addr.residential ||
            addr.quarter ||
            addr.commercial ||
            addr.village ||
            addr.road ||
            'Local Area';
          const city =
            addr.city ||
            addr.town ||
            addr.state_district ||
            addr.county ||
            addr.city_district ||
            'Lucknow';
          const state = addr.state || 'Uttar Pradesh';
          const pinCode = addr.postcode || '';
          const addressLine = addr.road || addr.amenity || locality;

          return NextResponse.json({
            latitude: numLat,
            longitude: numLon,
            displayName: item.display_name || `${locality}, ${city}, ${state}`,
            addressLine,
            locality,
            city,
            state,
            pinCode,
          });
        }
      }
    } catch (e) {
      console.warn('Server reverse geocode fetch failed:', e);
    }

    // Fallback: match known trade hubs
    let nearest: any = null;
    let minDist = Infinity;
    for (const hub of FALLBACK_GEOCODING_DATABASE) {
      const dLat = hub.latitude - numLat;
      const dLon = hub.longitude - numLon;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist < minDist) {
        minDist = dist;
        nearest = hub;
      }
    }

    if (nearest && minDist < 0.25) {
      return NextResponse.json({
        latitude: numLat,
        longitude: numLon,
        displayName: `${nearest.locality}, ${nearest.city}, ${nearest.state}`,
        addressLine: nearest.addressLine,
        locality: nearest.locality,
        city: nearest.city,
        state: nearest.state,
        pinCode: nearest.pinCode,
      });
    }

    return NextResponse.json({
      latitude: numLat,
      longitude: numLon,
      displayName: `Selected Location (${numLat.toFixed(4)}, ${numLon.toFixed(4)})`,
      locality: 'Selected Location',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
    });
  }

  if (slugPath === 'geocoding/search') {
    const q = query.q || query.query || '';
    if (!q.trim()) {
      return NextResponse.json([]);
    }
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=in&q=${encodeURIComponent(q)}&limit=5`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LocalSaathi-Platform/1.0 (contact@localsaathi.in)',
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const results = data.map((item: any) => {
            const addr = item.address || {};
            const locality =
              addr.amenity ||
              addr.suburb ||
              addr.neighbourhood ||
              addr.residential ||
              addr.quarter ||
              addr.commercial ||
              addr.village ||
              addr.road;
            const city =
              addr.city ||
              addr.town ||
              addr.state_district ||
              addr.county ||
              addr.city_district;
            return {
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
              displayName: item.display_name,
              addressLine: addr.road || addr.amenity || locality,
              locality,
              city,
              state: addr.state,
              pinCode: addr.postcode,
            };
          });
          return NextResponse.json(results);
        }
      }
    } catch (e) {
      console.warn('Server search places fetch failed:', e);
    }
    return NextResponse.json([]);
  }
      const filtered = query.status && query.status !== 'ALL'
        ? runtimeBookings.filter((b) => b.status === query.status)
        : runtimeBookings;
      return NextResponse.json({
        items: filtered,
        total: filtered.length,
        page: 1,
        limit: 20,
        pagination: {
          page: 1,
          limit: 20,
          total: filtered.length,
          totalPages: 1,
          hasNextPage: false,
        },
      });
    }

    // Detail view for employers/me/bookings/:bookingId or workers/me/bookings/:bookingId
    const bookingId = slug[slug.length - 1];
    const found = runtimeBookings.find((b) => b.id === bookingId) || runtimeBookings[0];
    if (found) {
      return NextResponse.json(found);
    }
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
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
  const slug = params.slug || [];
  const slugPath = slug.join('/');
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
        location: data.location
          ? {
              ...data.location,
              id: `demo-location-${id}`,
              jobPostId: id,
              addressLine: data.location.addressLine ?? null,
              locality: data.location.locality || 'Hazratganj',
              city: data.location.city || 'Lucknow',
              state: data.location.state || 'Uttar Pradesh',
              pinCode: data.location.pinCode || '226001',
              latitude: Number(data.location.latitude || 26.8467),
              longitude: Number(data.location.longitude || 80.9462),
            }
          : {
              id: `demo-location-${id}`,
              jobPostId: id,
              addressLine: null,
              locality: 'Hazratganj',
              city: 'Lucknow',
              state: 'Uttar Pradesh',
              pinCode: '226001',
              latitude: 26.8467,
              longitude: 80.9462,
            },
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
    try {
    const identifierType = body.identifierType === 'email' ? 'email' : 'phone';
    const intent = body.intent === 'signup' ? 'SIGNUP' : 'LOGIN';
    const email = identifierType === 'email' ? String(body.email || '').trim().toLowerCase() : '';
    let account = identifierType === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? await prisma.user.findUnique({ where: { email } })
      : null;
    if (intent === 'SIGNUP' && identifierType === 'email') return NextResponse.json({ message: 'Use your required mobile number to create the account. Email is optional.' }, { status: 400 });
    const enteredPhone = normalizePhone(body.phone);
    let phone = identifierType === 'email' ? (account && enteredPhone === account.phone ? account.phone : null) : enteredPhone;
    if (identifierType === 'phone' && !phone) return NextResponse.json({ message: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });
    if (identifierType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
    if (identifierType === 'email' && (!account || !phone || account.accountStatus !== 'ACTIVE')) {
      return NextResponse.json({ success: true, message: 'If an active account matches, a verification code will be sent to its registered phone.' });
    }
    if (!phone) return NextResponse.json({ message: 'The account does not have a registered mobile number.' }, { status: 400 });
    if (intent === 'LOGIN' && ['9123456780', '9876543210', '9999999999'].includes(phone) && process.env.DEMO_ACCOUNTS_ENABLED !== 'true') {
      return NextResponse.json({ message: 'Demo access is disabled in this environment.' }, { status: 403 });
    }
    if (intent === 'SIGNUP' && !['WORKER', 'EMPLOYER'].includes(body.role)) return NextResponse.json({ message: 'Choose Worker or Employer to create an account.' }, { status: 400 });
    const clientIp = (req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 45);
    if (clientIp !== 'unknown' && await prisma.auditLog.count({ where: { action: 'OTP_REQUESTED', ipAddress: clientIp, createdAt: { gte: new Date(Date.now() - 60_000) } } }) >= 10) {
      return NextResponse.json({ message: 'Too many verification requests. Please try again shortly.' }, { status: 429 });
    }
    if (identifierType === 'phone') account = await prisma.user.findUnique({ where: { phone } });
    if (intent === 'LOGIN' && (!account || account.accountStatus !== 'ACTIVE')) return NextResponse.json({ message: 'Account not found. Please create an account.' }, { status: 404 });
    if (intent === 'SIGNUP' && account) return NextResponse.json({ message: 'An account with this mobile number already exists. Please sign in.' }, { status: 409 });
    const lastChallenge = await prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
    const cooldown = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
    if (lastChallenge && Date.now() - lastChallenge.createdAt.getTime() < cooldown * 1000) return NextResponse.json({ message: `Please wait ${Math.ceil(cooldown - (Date.now() - lastChallenge.createdAt.getTime()) / 1000)} seconds before requesting another code.` }, { status: 429 });
    const production = process.env.NODE_ENV === 'production';
    const useTwilio = process.env.SMS_PROVIDER === 'twilio';
    let otp = crypto.randomInt(100000, 1000000).toString();
    if (useTwilio) {
      const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, service = process.env.TWILIO_VERIFY_SERVICE_SID;
      if (!sid || !token || !service) return NextResponse.json({ message: 'Phone verification is not configured.' }, { status: 503 });
      const sent = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: `+91${phone}`, Channel: 'sms' }), signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!sent?.ok) return NextResponse.json({ message: 'Could not send a verification code right now.' }, { status: 503 });
      otp = crypto.randomBytes(24).toString('hex');
    } else if (production) return NextResponse.json({ message: 'Configure Twilio Verify for production phone authentication.' }, { status: 503 });
    const expiresAt = new Date(Date.now() + Number(process.env.OTP_TTL_SECONDS || 300) * 1000);
    const [, challenge] = await prisma.$transaction([
      prisma.otpChallenge.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } }),
      prisma.otpChallenge.create({ data: { phone, otpHash: hashOtp(phone, otp), purpose: intent, expiresAt, maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 3) } }),
    ]);
    await prisma.auditLog.create({ data: { action: 'OTP_REQUESTED', entityType: 'OtpChallenge', entityId: challenge.id, ipAddress: clientIp === 'unknown' ? null : clientIp, userAgent: req.headers.get('user-agent')?.slice(0, 255) || null, metadata: { phone: `${phone.slice(0, 2)}****${phone.slice(-2)}`, purpose: intent } } });
    const responseMessage = useTwilio || production
      ? (identifierType === 'email' ? 'If an active account matches, a verification code will be sent to its registered phone.' : 'If the number is eligible, a verification code has been sent.')
      : `[Dev Mode] Verification code is: ${otp}`;
    return NextResponse.json({ success: true, message: responseMessage });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (['P1000', 'P1001', 'P1002', 'P1010', 'P1017', 'P2021', 'P2022'].includes(code)) {
        return NextResponse.json({ message: 'The account database is unavailable. Start PostgreSQL and apply the Prisma migrations, then try again.' }, { status: 503 });
      }
      console.error('OTP request failed:', error);
      return NextResponse.json({ message: 'Sign-in is temporarily unavailable. Check that PostgreSQL is running and its Prisma migrations are applied, then try again.' }, { status: 503 });
    }
  }

  // 2. Auth OTP Verify
  if (slugPath === 'auth/otp/verify') {
    const identifierType = body.identifierType === 'email' ? 'email' : 'phone';
    const email = identifierType === 'email' ? String(body.email || '').trim().toLowerCase() : '';
    const accountByEmail = identifierType === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? await prisma.user.findUnique({ where: { email } })
      : null;
    const enteredPhone = normalizePhone(body.phone);
    const phone = identifierType === 'email' ? (accountByEmail && enteredPhone === accountByEmail.phone ? accountByEmail.phone : null) : enteredPhone;
    const role = body.role;
    const submittedOtp = String(body.otp || '').trim();
    const intent = body.intent === 'signup' ? 'SIGNUP' : 'LOGIN';
    if (!phone || !/^\d{6}$/.test(submittedOtp)) return NextResponse.json({ message: 'Enter a valid mobile number and 6-digit code.' }, { status: 400 });
    if (intent === 'LOGIN' && ['9123456780', '9876543210', '9999999999'].includes(phone) && process.env.DEMO_ACCOUNTS_ENABLED !== 'true') return NextResponse.json({ message: 'Demo access is disabled in this environment.' }, { status: 403 });
    if (intent === 'SIGNUP' && !['WORKER', 'EMPLOYER'].includes(role)) return NextResponse.json({ message: 'Only Worker or Employer accounts can be created.' }, { status: 400 });
    const challenge = await prisma.otpChallenge.findFirst({ where: { phone, purpose: intent, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!challenge || challenge.expiresAt < new Date()) {
      if (challenge) await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      return NextResponse.json({ message: 'This code has expired. Request a new code.' }, { status: 400 });
    }
    if (challenge.attempts >= challenge.maxAttempts) return NextResponse.json({ message: 'Too many attempts. Request a new code.' }, { status: 429 });
    let valid = false;
    if (process.env.SMS_PROVIDER === 'twilio') {
      const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, service = process.env.TWILIO_VERIFY_SERVICE_SID;
      if (!sid || !token || !service) return NextResponse.json({ message: 'Phone verification is not configured.' }, { status: 503 });
      const checked = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: `+91${phone}`, Code: submittedOtp }), signal: AbortSignal.timeout(10000) }).catch(() => null);
      valid = Boolean(checked?.ok && (await checked.json().catch(() => null))?.status === 'approved');
    } else {
      const expected = Buffer.from(challenge.otpHash, 'hex'), candidate = Buffer.from(hashOtp(phone, submittedOtp), 'hex');
      valid = expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
    }
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts, ...(attempts >= challenge.maxAttempts ? { consumedAt: new Date() } : {}) } });
      return NextResponse.json({ message: 'Invalid verification code. Check the code and try again.' }, { status: 400 });
    }

    const profile = body.profile || {};
    if (intent === 'SIGNUP') {
      if (typeof profile.fullName !== 'string' || profile.fullName.trim().length < 2 || profile.fullName.trim().length > 100 || typeof profile.address !== 'string' || profile.address.trim().length < 5 || profile.address.trim().length > 255 || profile.consent !== true) return NextResponse.json({ message: 'Enter a valid name and address, then agree to the Terms and Privacy Policy.' }, { status: 400 });
      if (role === 'EMPLOYER' && (typeof profile.businessName !== 'string' || profile.businessName.trim().length < 2 || profile.businessName.trim().length > 150)) return NextResponse.json({ message: 'A valid business name is required for employer accounts.' }, { status: 400 });
      if (profile.email && (typeof profile.email !== 'string' || profile.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))) return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
      if (profile.trade && (typeof profile.trade !== 'string' || profile.trade.trim().length > 100)) return NextResponse.json({ message: 'Trade must be 100 characters or fewer.' }, { status: 400 });
      if (profile.workPreference && (typeof profile.workPreference !== 'string' || profile.workPreference.trim().length > 100)) return NextResponse.json({ message: 'Work preference must be 100 characters or fewer.' }, { status: 400 });
      if (profile.preferredLocation && (typeof profile.preferredLocation !== 'string' || profile.preferredLocation.trim().length > 100)) return NextResponse.json({ message: 'Preferred location must be 100 characters or fewer.' }, { status: 400 });
      if (profile.businessType && (typeof profile.businessType !== 'string' || profile.businessType.trim().length > 50)) return NextResponse.json({ message: 'Business type must be 50 characters or fewer.' }, { status: 400 });
      if (profile.city && (typeof profile.city !== 'string' || profile.city.trim().length > 100)) return NextResponse.json({ message: 'City must be 100 characters or fewer.' }, { status: 400 });
      if (profile.pinCode && (typeof profile.pinCode !== 'string' || !/^\d{6}$/.test(profile.pinCode))) return NextResponse.json({ message: 'Enter a valid 6-digit PIN code.' }, { status: 400 });
      const experience = Number(profile.experienceYears || 0), radius = Number(profile.preferredRadiusKm || 10), wage = Number(profile.expectedWage || 0);
      if (![experience, radius, wage].every(Number.isFinite) || experience < 0 || experience > 60 || radius < 1 || radius > 100 || wage < 0 || wage > 10000000) return NextResponse.json({ message: 'Check the worker experience, wage, and search radius values.' }, { status: 400 });
    }
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
        let found = await tx.user.findUnique({ where: { phone } });
        if (intent === 'LOGIN') {
          if (!found || found.accountStatus !== 'ACTIVE') throw new Error('ACCOUNT_NOT_FOUND');
          return found;
        }
        if (found) throw new Error('ACCOUNT_EXISTS');
        const name = profile.fullName.trim(), address = profile.address.trim();
        const email = typeof profile.email === 'string' && profile.email.trim() ? profile.email.trim().toLowerCase() : undefined;
        found = await tx.user.create({ data: {
          phone, email, role, accountStatus: 'ACTIVE',
          ...(role === 'WORKER' ? { workerProfile: { create: {
            displayName: name, bio: [address, profile.workPreference && `Preference: ${profile.workPreference}`, profile.preferredLocation && `Preferred area: ${profile.preferredLocation}`].filter(Boolean).join(' · '),
            experienceYears: Math.max(0, Math.min(60, Number(profile.experienceYears) || 0)), isAvailable: profile.isAvailable !== false,
            preferredRadiusKm: Math.max(1, Math.min(100, Number(profile.preferredRadiusKm) || 10)),
            ...(Number(profile.expectedWage) > 0 ? { expectedWage: Number(profile.expectedWage) } : {}),
            ...(typeof profile.trade === 'string' && profile.trade.trim() ? { workerSkills: { create: {
              experienceYears: Math.max(0, Number(profile.experienceYears) || 0),
              skill: { connectOrCreate: { where: { normalizedName: profile.trade.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 100) }, create: { name: profile.trade.trim().slice(0, 100), normalizedName: profile.trade.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 100), category: profile.trade.trim().slice(0, 50) } } },
            } } } : {}),
          } } } : { employerProfile: { create: {
            businessName: profile.businessName.trim(), businessType: profile.businessType?.trim() || null,
            description: `Contact person: ${name}`, addressLine: address, city: profile.city?.trim() || null,
            pinCode: profile.pinCode?.trim() || null, verificationState: 'UNVERIFIED',
          } } }),
        } });
        return found;
      });
    } catch (error: any) {
      if (error?.message === 'ACCOUNT_NOT_FOUND') return NextResponse.json({ message: 'Account not found. Please create an account.' }, { status: 404 });
      if (error?.message === 'ACCOUNT_EXISTS' || error?.code === 'P2002') {
        if (profile.email && await prisma.user.findUnique({ where: { email: String(profile.email).trim().toLowerCase() } })) return NextResponse.json({ message: 'An account with this email address already exists.' }, { status: 409 });
        return NextResponse.json({ message: 'An account with this mobile number already exists. Please sign in.' }, { status: 409 });
      }
      throw error;
    }
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const session = await prisma.session.create({ data: {
      userId: user.id, sessionTokenHash: crypto.createHmac('sha256', authPepper()).update(refreshToken).digest('hex'),
      deviceInfo: String(body.deviceInfo || 'Web').slice(0, 255), ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.slice(0, 45) || '127.0.0.1',
      userAgent: req.headers.get('user-agent')?.slice(0, 255) || 'Unknown', expiresAt: new Date(Date.now() + 7 * 86400000), lastUsedAt: new Date(),
    } });
    const response = NextResponse.json({ accessToken: signAuthToken({ sub: user.id, sessionId: session.id, role: user.role }), user: { id: user.id, role: user.role, accountStatus: user.accountStatus, verificationStatus: user.verificationStatus, createdAt: user.createdAt.toISOString() } });
    response.cookies.set('localsaathi_refresh', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth', maxAge: 7 * 86400 });
    return response;
  }

  if (slugPath === 'auth/demo') {
    const role = body.role;
    if (process.env.DEMO_ACCOUNTS_ENABLED !== 'true') return NextResponse.json({ message: 'Demo accounts are disabled in this environment.' }, { status: 403 });
    if (!['WORKER', 'EMPLOYER', 'ADMIN'].includes(role)) return NextResponse.json({ message: 'Select a valid demonstration profile.' }, { status: 400 });
    const phone = role === 'WORKER' ? '9123456780' : role === 'EMPLOYER' ? '9876543210' : '9999999999';
    const localDemoUser = role === 'WORKER' ? DEMO_WORKER : role === 'EMPLOYER' ? DEMO_EMPLOYER : DEMO_ADMIN;
    const allowLocalFallback = process.env.NODE_ENV !== 'production' && process.env.DEMO_ACCOUNTS_ENABLED === 'true';
    const localDemoResponse = () => NextResponse.json({
      accessToken: signAuthToken({ sub: localDemoUser.id, role: localDemoUser.role, demo: true }),
      user: localDemoUser,
    });

    try {
      const user = await prisma.user.findUnique({ where: { phone } });
      if (!user || user.role !== role || user.accountStatus !== 'ACTIVE') {
        return allowLocalFallback
          ? localDemoResponse()
          : NextResponse.json({ message: 'Demo account is not seeded in this database.' }, { status: 404 });
      }
      const refreshToken = crypto.randomBytes(40).toString('hex');
      const session = await prisma.session.create({ data: {
        userId: user.id, sessionTokenHash: crypto.createHmac('sha256', authPepper()).update(refreshToken).digest('hex'),
        deviceInfo: 'LocalSaathi demo', ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.slice(0, 45) || '127.0.0.1',
        userAgent: req.headers.get('user-agent')?.slice(0, 255) || 'Unknown', expiresAt: new Date(Date.now() + 7 * 86400000), lastUsedAt: new Date(),
      } });
      const response = NextResponse.json({ accessToken: signAuthToken({ sub: user.id, sessionId: session.id, role: user.role }), user: { id: user.id, role: user.role, accountStatus: user.accountStatus, verificationStatus: user.verificationStatus, createdAt: user.createdAt.toISOString() } });
      response.cookies.set('localsaathi_refresh', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth', maxAge: 7 * 86400 });
      return response;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      // Local demo accounts intentionally work without a running or migrated DB.
      // Keep this fallback confined to non-production environments with the
      // explicit demo flag enabled; production always requires persisted sessions.
      if (allowLocalFallback) {
        console.warn(`Using local demo login because database session creation failed${code ? ` (${code})` : ''}.`);
        return localDemoResponse();
      }
      if (['P1000', 'P1001', 'P1002', 'P1010', 'P1017'].includes(code)) {
        return NextResponse.json({ message: 'The account database is unavailable. Start PostgreSQL and apply the Prisma migrations, then try again.' }, { status: 503 });
      }
      console.error('Failed to create demo login session:', error);
      return NextResponse.json({ message: 'Could not start a demo session. Please try again.' }, { status: 500 });
    }
  }

  if (slugPath === 'auth/refresh') {
    const token = req.cookies.get('localsaathi_refresh')?.value;
    if (!token) return NextResponse.json({ message: 'Refresh token is required.' }, { status: 401 });
    const tokenHash = crypto.createHmac('sha256', authPepper()).update(token).digest('hex');
    const session = await prisma.session.findUnique({ where: { sessionTokenHash: tokenHash }, include: { user: true } });
    if (!session) {
      const reused = await prisma.session.findFirst({ where: { previousTokenHash: tokenHash } });
      if (reused) await prisma.session.updateMany({ where: { userId: reused.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return NextResponse.json({ message: 'Session expired. Please sign in again.' }, { status: 401 });
    }
    if (session.revokedAt || session.expiresAt <= new Date() || session.user.accountStatus !== 'ACTIVE') return NextResponse.json({ message: 'Session expired. Please sign in again.' }, { status: 401 });
    const nextToken = crypto.randomBytes(40).toString('hex');
    const rotated = await prisma.session.update({ where: { id: session.id }, data: { previousTokenHash: tokenHash, sessionTokenHash: crypto.createHmac('sha256', authPepper()).update(nextToken).digest('hex'), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) } });
    const response = NextResponse.json({ accessToken: signAuthToken({ sub: rotated.userId, sessionId: rotated.id, role: session.user.role }) });
    response.cookies.set('localsaathi_refresh', nextToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth', maxAge: 7 * 86400 });
    return response;
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
    const bookingId = slug.find((s) => s.startsWith('booking-')) || slug[slug.length - 2] || slug[slug.length - 1];
    let booking = runtimeBookings.find((b) => b.id === bookingId);
    if (!booking && runtimeBookings.length > 0) {
      booking = runtimeBookings[0];
    }
    const isStart = slugPath.endsWith('/start');
    const isComplete = slugPath.endsWith('/complete');
    const isConfirm = slugPath.endsWith('/confirm');
    const isCancel = slugPath.endsWith('/cancel');

    if (booking) {
      if (isStart) {
        booking.status = 'IN_PROGRESS';
        booking.startedAt = new Date().toISOString();
      } else if (isComplete) {
        booking.status = 'COMPLETED';
        booking.completedAt = new Date().toISOString();
      } else if (isConfirm) {
        booking.status = 'CONFIRMED';
        booking.confirmedAt = new Date().toISOString();
      } else if (isCancel) {
        booking.status = 'CANCELLED';
        booking.cancelledAt = new Date().toISOString();
        booking.cancellationReason = body?.reason || 'Cancelled by user';
      }
      return NextResponse.json(booking);
    }

    return NextResponse.json({
      id: bookingId || `booking-${Date.now()}`,
      status: isComplete ? 'COMPLETED' : isStart ? 'IN_PROGRESS' : isCancel ? 'CANCELLED' : 'CONFIRMED',
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

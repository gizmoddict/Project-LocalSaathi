import { NextRequest, NextResponse } from 'next/server';
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
let runtimeJobs = [...DEMO_JOBS];
let runtimeBookings = [...DEMO_BOOKINGS];
let runtimeNotifications = [...DEMO_NOTIFICATIONS];

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugPath = (params.slug || []).join('/');
  const query = parseQueryParams(req);

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
    let items = [...runtimeJobs];
    if (query.category) {
      items = items.filter((j) => j.category.toLowerCase() === query.category.toLowerCase());
    }
    return NextResponse.json({
      items,
      total: items.length,
      page: Number(query.page || 1),
      limit: Number(query.limit || 10),
    });
  }
  if (slugPath.startsWith('workers/me/jobs/')) {
    const jobId = slugPath.replace('workers/me/jobs/', '');
    const job = runtimeJobs.find((j) => j.id === jobId) || runtimeJobs[0];
    return NextResponse.json(job);
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

  // 1. Auth OTP Request
  if (slugPath === 'auth/otp/request') {
    return NextResponse.json({
      success: true,
      message: '[Dev Mode] Verification code is: 123456',
    });
  }

  // 2. Auth OTP Verify
  if (slugPath === 'auth/otp/verify') {
    const role = body.role || 'WORKER';
    let user = DEMO_WORKER;
    if (role === 'EMPLOYER') user = DEMO_EMPLOYER;
    if (role === 'ADMIN') user = DEMO_ADMIN;

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
  return NextResponse.json({
    success: true,
    message: `Resource deleted at ${slugPath}`,
  });
}

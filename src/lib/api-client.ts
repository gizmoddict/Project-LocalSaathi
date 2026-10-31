import {
  WorkerProfileResponse,
  WorkerSkillResponse,
  WorkerLocationResponse,
  WorkerAvailabilityResponse,
  WorkerCompletionResponse,
  SkillCatalogItem,
  EmployerProfileResponse,
  EmployerCompletionResponse,
  EmployerDashboardResponse,
  JobResponse,
  JobListResponse,
  JobStatus,
  DiscoveredJobItem,
  WorkerJobDiscoveryResponse,
  WorkerJobDetailResponse,
  WorkerJobDiscoveryQuery,
  ApplicationStatus,
  WorkerApplicationDetail,
  WorkerApplicationListResponse,
  EmployerApplicationItem,
  EmployerApplicationListResponse,
  BookingDetail,
  BookingListResponse,
  BookingQueryInput,
  CreateBookingInput,
  NotificationListResponse,
  NotificationItem,
  UnreadCountResponse,
  NotificationPreferenceResponse,
  MarkReadResponse,
  MarkAllReadResponse,
  UpdateNotificationPreferenceInput,
  OutboxEventListResponse,
  DeadLetterActionResponse,
  OutboxMetricsResponse,
  ConversationDto,
  MessageDto,
  CreateConversationRequest,
  SendMessageRequest,
  ConversationListQuery,
  MessageListQuery,
  CircuitBreakerStats,
  DisasterRecoveryStatusResponse,
  ReportMessageRequest,
  PaymentResponse,
  RefundResponse,
  PayoutResponse,
  PaymentEventResponse,
  ReconciliationReport,
  AdminOverviewMetrics,
  AdminUserItem,
  AdminUserDetail,
  AdminUserQuery,
  AdminWorkerItem,
  AdminWorkerQuery,
  AdminEmployerItem,
  AdminEmployerQuery,
  AdminJobItem,
  AdminJobQuery,
  PauseJobDto,
  AdminReportItem,
  AdminReportQuery,
  AdminDisputeItem,
  AdminDisputeQuery,
  AdminVerificationItem,
  AdminVerificationQuery,
  AdminModerationItem,
  AdminModerationQuery,
  AdminPaymentItem,
  AdminPaymentQuery,
  AdminAnalyticsResponse,
  AdminSystemHealthResponse,
  AdminAuditLogItem,
  AdminAuditLogQuery,
  SuspendUserDto,
  ReinstateUserDto,
  ProductAnalyticsDashboardData,
  AdminAnalyticsEventQuery,
  AdminAnalyticsEventListResponse,
  CentralizedSystemHealth,
  AlertEvaluationSummary,
  UserRole,
  AccountStatus,
  VerificationStatus,
} from '@localsaathi/types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || '/api/v1';

const DEMO_JOBS_STORAGE_KEY = 'localsaathi.demo.jobs.v1';

function readLocalDemoJobs(): JobResponse[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(DEMO_JOBS_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value as JobResponse[] : [];
  } catch {
    return [];
  }
}

function writeLocalDemoJobs(jobs: JobResponse[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // Demo-mode persistence is best-effort when browser storage is unavailable.
  }
}

function saveLocalDemoJob(job: JobResponse) {
  const jobs = readLocalDemoJobs();
  writeLocalDemoJobs([job, ...jobs.filter((item) => item.id !== job.id)]);
}

function updateLocalDemoJob(jobId: string, changes: Partial<JobResponse>): JobResponse | null {
  const jobs = readLocalDemoJobs();
  const existing = jobs.find((job) => job.id === jobId);
  if (!existing) return null;
  const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
  writeLocalDemoJobs(jobs.map((job) => job.id === jobId ? updated : job));
  return updated;
}

function toDiscoveredDemoJob(job: JobResponse): DiscoveredJobItem {
  const location = job.location || {
    locality: 'Local area', city: 'Nearby', state: '', pinCode: '', addressLine: null,
  };
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    status: job.status,
    urgency: job.urgency,
    wageType: job.wageType,
    wageAmount: job.wageAmount,
    workerCount: job.workerCount,
    durationDays: job.durationDays,
    startDate: job.startDate,
    startTime: job.startTime,
    requirements: job.requirements,
    languageRequirements: job.languageRequirements,
    publishedAt: job.publishedAt,
    createdAt: job.createdAt,
    location,
    employer: {
      businessName: 'LocalSaathi Demo Employer',
      businessType: 'Contractor',
      locality: location.locality,
      city: location.city,
      verificationState: 'VERIFIED',
      totalJobsPosted: 1,
    },
    requiredSkills: job.requiredSkills.map(({ skillId, name, category, isRequired, minExperienceYears }) => ({ skillId, name, category, isRequired, minExperienceYears })),
    distanceKm: 0,
    match: {
      eligible: true,
      score: 85,
      reasons: ['Recently posted by a local employer'],
      breakdown: {
        distanceKm: 0,
        effectiveRadiusKm: 30,
        distanceScore: 25,
        matchedSkillsCount: job.requiredSkills.length,
        totalRequiredSkillsCount: job.requiredSkills.length,
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
  };
}

function mergeLocalDemoJobs(response: WorkerJobDiscoveryResponse, query?: WorkerJobDiscoveryQuery): WorkerJobDiscoveryResponse {
  const localJobs = readLocalDemoJobs()
    .filter((job) => job.status === JobStatus.PUBLISHED)
    .filter((job) => !query?.category || job.category.toLowerCase() === query.category.toLowerCase())
    .filter((job) => query?.minWage === undefined || job.wageAmount >= query.minWage)
    .filter((job) => query?.maxWage === undefined || job.wageAmount <= query.maxWage)
    .map(toDiscoveredDemoJob);
  if (!localJobs.length) return response;

  const byId = new Map(response.items.map((job) => [job.id, job]));
  localJobs.forEach((job) => { if (!byId.has(job.id)) byId.set(job.id, job); });
  const page = query?.page ?? response.pagination?.page ?? 1;
  const limit = query?.limit ?? response.pagination?.limit ?? 20;
  const items = [...byId.values()];
  const total = items.length;
  return {
    items: items.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasNextPage: page * limit < total },
  };
}

export class ApiClient {
  private token: string | null = null;

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || localStorage.getItem('accessToken');
    }
    return null;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');
      }
    }
  }

  async requestOtp(phone: string, role: 'WORKER' | 'EMPLOYER' | 'ADMIN'): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone, role }),
    });
  }

  async verifyOtp(
    phone: string,
    otp: string,
    role: 'WORKER' | 'EMPLOYER' | 'ADMIN'
  ): Promise<{
    accessToken: string;
    user: {
      id: string;
      role: UserRole;
      accountStatus: AccountStatus;
      verificationStatus: VerificationStatus;
      createdAt: string;
    };
  }> {
    return this.request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        otp,
        role,
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'web',
      }),
    });
  }

  async getMe(): Promise<{
    id: string;
    role: UserRole;
    accountStatus: AccountStatus;
    verificationStatus: VerificationStatus;
    createdAt: string;
  }> {
    return this.request('/auth/me');
  }

  async logout(): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/logout', { method: 'POST' });
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryAfterRefresh = true
  ): Promise<T> {
    const headers = new Headers(options.headers || {});
    const authToken = this.getToken();
    if (authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (
      response.status === 401 &&
      retryAfterRefresh &&
      this.getToken() &&
      endpoint !== '/auth/refresh' &&
      endpoint !== '/auth/otp/request' &&
      endpoint !== '/auth/otp/verify'
    ) {
      try {
        const refreshed = await this.request<{ accessToken: string }>(
          '/auth/refresh',
          { method: 'POST', body: JSON.stringify({}) },
          false
        );
        this.setToken(refreshed.accessToken);
        return this.request<T>(endpoint, options, false);
      } catch (refreshError) {
        this.setToken(null);
        throw refreshError;
      }
    }

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => null);
      let errorMessage: string | undefined;

      if (errorData && typeof errorData === 'object') {
        const payload = errorData as {
          message?: unknown;
          error?: { message?: unknown } | string;
        };
        const nestedMessage =
          payload.error && typeof payload.error === 'object'
            ? payload.error.message
            : undefined;
        const message = nestedMessage ?? payload.message;
        if (typeof message === 'string') {
          errorMessage = message;
        } else if (Array.isArray(message)) {
          errorMessage = message.filter((item): item is string => typeof item === 'string').join(', ');
        }
      }

      const error = new Error(errorMessage || `Request failed with status ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const payload: unknown = await response.json();
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'success' in payload &&
      payload.success === true &&
      'data' in payload &&
      ('requestId' in payload || 'timestamp' in payload)
    ) {
      return payload.data as T;
    }
    return payload as T;
  }

  // ---------------------------------------------------------------------------
  // Worker Endpoints
  // ---------------------------------------------------------------------------

  async getProfile(): Promise<WorkerProfileResponse> {
    return this.request<WorkerProfileResponse>('/workers/me');
  }

  async updateProfile(data: Partial<WorkerProfileResponse>): Promise<WorkerProfileResponse> {
    return this.request<WorkerProfileResponse>('/workers/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getSkills(): Promise<WorkerSkillResponse[]> {
    return this.request<WorkerSkillResponse[]>('/workers/me/skills');
  }

  async addSkill(data: {
    skillId?: string;
    name?: string;
    proficiency?: string;
    experienceYears?: number;
  }): Promise<WorkerSkillResponse> {
    return this.request<WorkerSkillResponse>('/workers/me/skills', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSkill(
    skillId: string,
    data: { proficiency?: string; experienceYears?: number }
  ): Promise<WorkerSkillResponse> {
    return this.request<WorkerSkillResponse>(`/workers/me/skills/${skillId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async removeSkill(skillId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/workers/me/skills/${skillId}`, {
      method: 'DELETE',
    });
  }

  async getLocation(): Promise<WorkerLocationResponse | null> {
    return this.request<WorkerLocationResponse | null>('/workers/me/location');
  }

  async updateLocation(data: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    addressLine?: string | null;
    locality?: string | null;
    city?: string | null;
    state?: string | null;
    pinCode?: string | null;
    preferredRadiusKm?: number;
  }): Promise<WorkerLocationResponse> {
    return this.request<WorkerLocationResponse>('/workers/me/location', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAvailability(): Promise<WorkerAvailabilityResponse[]> {
    return this.request<WorkerAvailabilityResponse[]>('/workers/me/availability');
  }

  async createAvailability(data: {
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    status?: string;
  }): Promise<WorkerAvailabilityResponse> {
    return this.request<WorkerAvailabilityResponse>('/workers/me/availability', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAvailability(
    id: string,
    data: { startTime?: string | null; endTime?: string | null; status?: string }
  ): Promise<WorkerAvailabilityResponse> {
    return this.request<WorkerAvailabilityResponse>(`/workers/me/availability/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAvailability(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/workers/me/availability/${id}`, {
      method: 'DELETE',
    });
  }

  async getCompletion(): Promise<WorkerCompletionResponse> {
    return this.request<WorkerCompletionResponse>('/workers/me/completion');
  }

  async completeOnboarding(): Promise<{
    success: boolean;
    onboardingStatus: string;
    completionPercentage: number;
  }> {
    return this.request('/workers/me/onboarding/complete', {
      method: 'POST',
    });
  }

  async uploadPhoto(file: File): Promise<{ profilePhotoKey: string; profilePhotoUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/workers/me/photo', {
      method: 'POST',
      body: formData,
    });
  }

  async getSkillsCatalog(category?: string, query?: string): Promise<SkillCatalogItem[]> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (query) params.set('query', query);
    const queryString = params.toString();
    return this.request<SkillCatalogItem[]>(
      `/workers/skills${queryString ? `?${queryString}` : ''}`
    );
  }

  async getDiscoveredJobs(query?: WorkerJobDiscoveryQuery): Promise<WorkerJobDiscoveryResponse> {
    const params = new URLSearchParams();
    if (query?.radiusKm) params.set('radiusKm', String(query.radiusKm));
    if (query?.latitude !== undefined) params.set('latitude', String(query.latitude));
    if (query?.longitude !== undefined) params.set('longitude', String(query.longitude));
    if (query?.skillId) params.set('skillId', query.skillId);
    if (query?.category) params.set('category', query.category);
    if (query?.wageType) params.set('wageType', query.wageType);
    if (query?.minWage !== undefined) params.set('minWage', String(query.minWage));
    if (query?.maxWage !== undefined) params.set('maxWage', String(query.maxWage));
    if (query?.date) params.set('date', query.date);
    if (query?.sort) params.set('sort', query.sort);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    const result = await this.request<WorkerJobDiscoveryResponse>(`/workers/me/jobs${qs ? `?${qs}` : ''}`);
    return mergeLocalDemoJobs(result, query);
  }

  async getNearbyJobs(query?: { radiusKm?: number; latitude?: number; longitude?: number; page?: number; limit?: number }): Promise<WorkerJobDiscoveryResponse> {
    const params = new URLSearchParams();
    if (query?.radiusKm) params.set('radiusKm', String(query.radiusKm));
    if (query?.latitude !== undefined) params.set('latitude', String(query.latitude));
    if (query?.longitude !== undefined) params.set('longitude', String(query.longitude));
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    const result = await this.request<WorkerJobDiscoveryResponse>(`/workers/me/jobs/nearby${qs ? `?${qs}` : ''}`);
    return mergeLocalDemoJobs(result, query);
  }

  async getWorkerJobDetail(jobId: string): Promise<WorkerJobDetailResponse> {
    try {
      return await this.request<WorkerJobDetailResponse>(`/workers/me/jobs/${jobId}`);
    } catch (error) {
      const job = readLocalDemoJobs().find((item) => item.id === jobId && item.status === JobStatus.PUBLISHED);
      if (!job) throw error;
      return { ...toDiscoveredDemoJob(job), skillDetails: [] };
    }
  }

  // ---------------------------------------------------------------------------
  // Employer & Job Endpoints
  // ---------------------------------------------------------------------------

  async getEmployerProfile(): Promise<EmployerProfileResponse> {
    return this.request<EmployerProfileResponse>('/employers/me');
  }

  async updateEmployerProfile(data: {
    businessName?: string;
    description?: string | null;
    businessType?: string | null;
    contactPreferences?: string[];
    addressLine?: string | null;
    locality?: string;
    city?: string;
    state?: string;
    pinCode?: string;
  }): Promise<EmployerProfileResponse> {
    return this.request<EmployerProfileResponse>('/employers/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getEmployerCompletion(): Promise<EmployerCompletionResponse> {
    return this.request<EmployerCompletionResponse>('/employers/me/completion');
  }

  async completeEmployerOnboarding(): Promise<{
    success: boolean;
    onboardingStatus: string;
    completionPercentage: number;
  }> {
    return this.request('/employers/me/onboarding/complete', {
      method: 'POST',
    });
  }

  async getEmployerDashboard(): Promise<EmployerDashboardResponse> {
    return this.request<EmployerDashboardResponse>('/employers/me/dashboard');
  }

  async createJob(data: {
    title: string;
    description: string;
    category: string;
    wageType: string;
    wageAmount: number;
    workerCount?: number;
    durationDays?: number;
    startDate: string;
    startTime?: string;
    urgency?: string;
    requirements?: string[];
    languageRequirements?: string[];
    skills?: Array<{
      skillId?: string;
      name?: string;
      isRequired?: boolean;
      minExperienceYears?: number;
    }>;
    location?: {
      latitude: number;
      longitude: number;
      addressLine?: string | null;
      locality: string;
      city: string;
      state: string;
      pinCode: string;
    };
  }): Promise<JobResponse> {
    const job = await this.request<JobResponse>('/employers/me/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    saveLocalDemoJob(job);
    return job;
  }

  async getJobs(params?: {
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<JobListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    const qs = searchParams.toString();
    const result = await this.request<JobListResponse>(`/employers/me/jobs${qs ? `?${qs}` : ''}`);
    const localJobs = readLocalDemoJobs();
    if (!localJobs.length) return result;
    const jobsById = new Map<string, JobResponse>();
    [...result.jobs, ...localJobs].forEach((job) => jobsById.set(job.id, job));
    const allJobs = [...jobsById.values()].filter((job) => !params?.status || job.status === params.status);
    const page = params?.page ?? result.page ?? 1;
    const limit = params?.limit ?? result.limit ?? 10;
    return {
      jobs: allJobs.slice((page - 1) * limit, page * limit),
      total: allJobs.length,
      page,
      limit,
      totalPages: Math.ceil(allJobs.length / limit) || 1,
    };
  }

  async getJobById(jobId: string): Promise<JobResponse> {
    try {
      return await this.request<JobResponse>(`/employers/me/jobs/${jobId}`);
    } catch (error) {
      const localJob = readLocalDemoJobs().find((job) => job.id === jobId);
      if (localJob) return localJob;
      throw error;
    }
  }

  async updateJob(
    jobId: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      wageType?: string;
      wageAmount?: number;
      workerCount?: number;
      durationDays?: number;
      startDate?: string;
      startTime?: string;
      urgency?: string;
      requirements?: string[];
      languageRequirements?: string[];
      skills?: Array<{
        skillId?: string;
        name?: string;
        isRequired?: boolean;
        minExperienceYears?: number;
      }>;
      location?: {
        latitude: number;
        longitude: number;
        addressLine?: string | null;
        locality: string;
        city: string;
        state: string;
        pinCode: string;
      };
    }
  ): Promise<JobResponse> {
    try {
      const job = await this.request<JobResponse>(`/employers/me/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      saveLocalDemoJob(job);
      return job;
    } catch (error) {
      const localJob = updateLocalDemoJob(jobId, data as Partial<JobResponse>);
      if (localJob) return localJob;
      throw error;
    }
  }

  async deleteJob(jobId: string): Promise<{ success: boolean }> {
    try {
      const result = await this.request<{ success: boolean }>(`/employers/me/jobs/${jobId}`, { method: 'DELETE' });
      writeLocalDemoJobs(readLocalDemoJobs().filter((job) => job.id !== jobId));
      return result;
    } catch (error) {
      const exists = readLocalDemoJobs().some((job) => job.id === jobId);
      if (!exists) throw error;
      writeLocalDemoJobs(readLocalDemoJobs().filter((job) => job.id !== jobId));
      return { success: true };
    }
  }

  async publishJob(jobId: string): Promise<JobResponse> {
    return this.updateJobStatus(jobId, JobStatus.PUBLISHED, 'publish');
  }

  async pauseJob(jobId: string): Promise<JobResponse> {
    return this.updateJobStatus(jobId, JobStatus.PAUSED, 'pause');
  }

  async resumeJob(jobId: string): Promise<JobResponse> {
    return this.updateJobStatus(jobId, JobStatus.PUBLISHED, 'resume');
  }

  async fillJob(jobId: string): Promise<JobResponse> {
    return this.updateJobStatus(jobId, JobStatus.FILLED, 'fill');
  }

  async closeJob(jobId: string): Promise<JobResponse> {
    return this.updateJobStatus(jobId, JobStatus.CANCELLED, 'close');
  }

  private async updateJobStatus(jobId: string, status: JobResponse['status'], action: string): Promise<JobResponse> {
    try {
      const job = await this.request<JobResponse>(`/employers/me/jobs/${jobId}/${action}`, { method: 'POST' });
      saveLocalDemoJob(job);
      return job;
    } catch (error) {
      const localJob = updateLocalDemoJob(jobId, { status, publishedAt: status === JobStatus.PUBLISHED ? new Date().toISOString() : null });
      if (localJob) return localJob;
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Worker Application API
  // ---------------------------------------------------------------------------

  async applyToJob(
    jobId: string,
    message?: string
  ): Promise<{ id: string; jobId: string; status: ApplicationStatus; appliedAt: string }> {
    return this.request(`/workers/me/jobs/${jobId}/applications`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getWorkerApplications(query?: {
    status?: ApplicationStatus;
    page?: number;
    limit?: number;
    sort?: string;
  }): Promise<WorkerApplicationListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.sort) params.set('sort', query.sort);
    const qs = params.toString();
    return this.request<WorkerApplicationListResponse>(
      `/workers/me/applications${qs ? `?${qs}` : ''}`
    );
  }

  async getWorkerApplicationDetail(applicationId: string): Promise<WorkerApplicationDetail> {
    return this.request<WorkerApplicationDetail>(`/workers/me/applications/${applicationId}`);
  }

  async getWorkerApplicationForJob(jobId: string): Promise<WorkerApplicationDetail> {
    return this.request<WorkerApplicationDetail>(`/workers/me/jobs/${jobId}/application`);
  }

  async withdrawApplication(applicationId: string): Promise<WorkerApplicationDetail> {
    return this.request<WorkerApplicationDetail>(
      `/workers/me/applications/${applicationId}/withdraw`,
      {
        method: 'POST',
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Employer Application API
  // ---------------------------------------------------------------------------

  async getEmployerJobApplications(
    jobId: string,
    query?: {
      status?: ApplicationStatus;
      page?: number;
      limit?: number;
      sort?: string;
    }
  ): Promise<EmployerApplicationListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.sort) params.set('sort', query.sort);
    const qs = params.toString();
    return this.request<EmployerApplicationListResponse>(
      `/employers/me/jobs/${jobId}/applications${qs ? `?${qs}` : ''}`
    );
  }

  async getJobApplications(
    jobId: string,
    query?: {
      status?: ApplicationStatus;
      page?: number;
      limit?: number;
      sort?: string;
    }
  ): Promise<EmployerApplicationListResponse> {
    return this.getEmployerJobApplications(jobId, query);
  }

  async getEmployerApplicationDetail(
    applicationId: string
  ): Promise<EmployerApplicationItem> {
    return this.request<EmployerApplicationItem>(`/employers/me/applications/${applicationId}`);
  }

  async shortlistApplication(applicationId: string): Promise<EmployerApplicationItem> {
    return this.request<EmployerApplicationItem>(
      `/employers/me/applications/${applicationId}/shortlist`,
      {
        method: 'POST',
      }
    );
  }

  async rejectApplication(applicationId: string): Promise<EmployerApplicationItem> {
    return this.request<EmployerApplicationItem>(
      `/employers/me/applications/${applicationId}/reject`,
      {
        method: 'POST',
      }
    );
  }

  async acceptApplication(applicationId: string): Promise<EmployerApplicationItem> {
    return this.request<EmployerApplicationItem>(
      `/employers/me/applications/${applicationId}/accept`,
      {
        method: 'POST',
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Booking Endpoints
  // ---------------------------------------------------------------------------

  async createBooking(
    applicationId: string,
    data?: CreateBookingInput
  ): Promise<BookingDetail> {
    return this.request<BookingDetail>(
      `/employers/me/applications/${applicationId}/bookings`,
      {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }
    );
  }

  async getEmployerBookings(
    query?: BookingQueryInput
  ): Promise<BookingListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.sort) params.set('sort', query.sort);
    const qs = params.toString();
    return this.request<BookingListResponse>(
      `/employers/me/bookings${qs ? `?${qs}` : ''}`
    );
  }

  async getEmployerBookingDetail(bookingId: string): Promise<BookingDetail> {
    return this.request<BookingDetail>(`/employers/me/bookings/${bookingId}`);
  }

  async startBooking(bookingId: string): Promise<BookingDetail> {
    return this.request<BookingDetail>(`/employers/me/bookings/${bookingId}/start`, {
      method: 'POST',
    });
  }

  async completeBooking(bookingId: string): Promise<BookingDetail> {
    return this.request<BookingDetail>(
      `/employers/me/bookings/${bookingId}/complete`,
      {
        method: 'POST',
      }
    );
  }

  async cancelEmployerBooking(
    bookingId: string,
    reason: string
  ): Promise<BookingDetail> {
    return this.request<BookingDetail>(
      `/employers/me/bookings/${bookingId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  }

  async getWorkerBookings(
    query?: BookingQueryInput
  ): Promise<BookingListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.sort) params.set('sort', query.sort);
    const qs = params.toString();
    return this.request<BookingListResponse>(
      `/workers/me/bookings${qs ? `?${qs}` : ''}`
    );
  }

  async getWorkerBookingDetail(bookingId: string): Promise<BookingDetail> {
    return this.request<BookingDetail>(`/workers/me/bookings/${bookingId}`);
  }

  async confirmBooking(bookingId: string): Promise<BookingDetail> {
    return this.request<BookingDetail>(
      `/workers/me/bookings/${bookingId}/confirm`,
      {
        method: 'POST',
      }
    );
  }

  async cancelWorkerBooking(
    bookingId: string,
    reason: string
  ): Promise<BookingDetail> {
    return this.request<BookingDetail>(
      `/workers/me/bookings/${bookingId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Notification Endpoints
  // ---------------------------------------------------------------------------

  async getNotifications(query?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
  }): Promise<NotificationListResponse> {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.unreadOnly) params.set('unreadOnly', 'true');
    if (query?.type) params.set('type', query.type);
    const qs = params.toString();
    return this.request<NotificationListResponse>(
      `/notifications${qs ? `?${qs}` : ''}`
    );
  }

  async getUnreadCount(): Promise<UnreadCountResponse> {
    return this.request<UnreadCountResponse>('/notifications/unread-count');
  }

  async getNotificationById(notificationId: string): Promise<NotificationItem> {
    return this.request<NotificationItem>(`/notifications/${notificationId}`);
  }

  async markNotificationRead(notificationId: string): Promise<MarkReadResponse> {
    return this.request<MarkReadResponse>(
      `/notifications/${notificationId}/read`,
      { method: 'PATCH' }
    );
  }

  async deleteNotification(
    notificationId: string
  ): Promise<{ success: boolean; id: string }> {
    return this.request<{ success: boolean; id: string }>(
      `/notifications/${notificationId}`,
      { method: 'DELETE' }
    );
  }

  async markAllNotificationsRead(): Promise<MarkAllReadResponse> {
    return this.request<MarkAllReadResponse>('/notifications/read-all', {
      method: 'POST',
    });
  }

  async getNotificationPreferences(): Promise<NotificationPreferenceResponse> {
    return this.request<NotificationPreferenceResponse>(
      '/notifications/preferences'
    );
  }

  async updateNotificationPreferences(
    data: UpdateNotificationPreferenceInput
  ): Promise<NotificationPreferenceResponse> {
    return this.request<NotificationPreferenceResponse>(
      '/notifications/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Outbox & Dead-Letter Queue Endpoints
  // ---------------------------------------------------------------------------

  async getAdminOutboxEvents(query?: {
    status?: string;
    eventType?: string;
    page?: number;
    limit?: number;
  }): Promise<OutboxEventListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.eventType) params.set('eventType', query.eventType);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.request<OutboxEventListResponse>(
      `/admin/events/outbox${qs ? `?${qs}` : ''}`
    );
  }

  async getAdminDeadLetterEvents(query?: {
    page?: number;
    limit?: number;
  }): Promise<OutboxEventListResponse> {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.request<OutboxEventListResponse>(
      `/admin/events/dead-letter${qs ? `?${qs}` : ''}`
    );
  }

  async retryAdminDeadLetterEvent(id: string): Promise<DeadLetterActionResponse> {
    return this.request<DeadLetterActionResponse>(
      `/admin/events/dead-letter/${id}/retry`,
      { method: 'POST' }
    );
  }

  async discardAdminDeadLetterEvent(id: string): Promise<DeadLetterActionResponse> {
    return this.request<DeadLetterActionResponse>(
      `/admin/events/dead-letter/${id}/discard`,
      { method: 'POST' }
    );
  }

  async getAdminOutboxMetrics(): Promise<OutboxMetricsResponse> {
    return this.request<OutboxMetricsResponse>('/admin/events/metrics');
  }

  // ---------------------------------------------------------------------------
  // Messaging & Conversations Endpoints (Phase 11)
  // ---------------------------------------------------------------------------

  async createConversation(data: CreateConversationRequest): Promise<ConversationDto> {
    return this.request<ConversationDto>('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listConversations(query?: ConversationListQuery): Promise<{
    conversations: ConversationDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.cursor) params.set('cursor', query.cursor);
    if (query?.archived !== undefined) params.set('archived', String(query.archived));
    const qs = params.toString();
    return this.request(`/conversations${qs ? `?${qs}` : ''}`);
  }

  async getConversation(id: string): Promise<ConversationDto> {
    return this.request<ConversationDto>(`/conversations/${id}`);
  }

  async getMessagingUnreadCount(): Promise<{ unreadCount: number }> {
    return this.request<{ unreadCount: number }>('/conversations/unread-count');
  }

  async listMessages(
    conversationId: string,
    query?: MessageListQuery
  ): Promise<{
    messages: MessageDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.cursor) params.set('cursor', query.cursor);
    if (query?.direction) params.set('direction', query.direction);
    const qs = params.toString();
    return this.request(`/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`);
  }

  async sendMessage(
    conversationId: string,
    data: SendMessageRequest
  ): Promise<MessageDto> {
    return this.request<MessageDto>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async markConversationRead(
    conversationId: string,
    lastReadMessageId?: string
  ): Promise<{ conversationId: string; lastReadMessageId: string | null; lastReadAt: string }> {
    return this.request(`/conversations/${conversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({ lastReadMessageId }),
    });
  }

  async muteConversation(
    conversationId: string,
    mute = true
  ): Promise<{ conversationId: string; isMuted: boolean }> {
    return this.request(`/conversations/${conversationId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ mute }),
    });
  }

  async archiveConversation(
    conversationId: string,
    archive = true
  ): Promise<{ conversationId: string; isArchived: boolean }> {
    return this.request(`/conversations/${conversationId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ archive }),
    });
  }

  async editMessage(messageId: string, body: string): Promise<MessageDto> {
    return this.request<MessageDto>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  async deleteMessage(messageId: string): Promise<{ id: string; deleted: boolean; deletedAt?: string }> {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async reportMessage(messageId: string, data: ReportMessageRequest) {
    return this.request(`/messages/${messageId}/report`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async blockUser(userId: string, reason?: string) {
    return this.request(`/users/${userId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async unblockUser(userId: string) {
    return this.request(`/users/${userId}/block`, {
      method: 'DELETE',
    });
  }

  async getBlockedUsers() {
    return this.request<Array<{ id: string; blockedId: string; reason: string | null; user: { id: string; role: string; displayName: string } }>>('/users/blocked');
  }

  // ---------------------------------------------------------------------------
  // Trust, Verification & Safety Endpoints
  // ---------------------------------------------------------------------------

  async submitVerification(data: {
    verificationType: string;
    providerReference?: string;
    documents: Array<{
      type: string;
      objectStorageKey: string;
      mimeType: string;
      fileSizeBytes: number;
    }>;
  }) {
    return this.request('/verifications/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getVerificationStatus() {
    return this.request<{
      userId: string;
      overallStatus: string;
      accountStatus: string;
      latestVerification: any | null;
    }>('/verifications/status');
  }

  async getVerification(id: string) {
    return this.request(`/verifications/${id}`);
  }

  async reportUser(userId: string, data: { reason: string; details?: string }) {
    return this.request(`/users/${userId}/reports`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reportJob(jobId: string, data: { reason: string; details?: string }) {
    return this.request(`/jobs/${jobId}/reports`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reportMessageSafety(messageId: string, data: { reason: string; details?: string }) {
    return this.request(`/messages/${messageId}/reports`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyReports() {
    return this.request<Array<any>>('/reports/mine');
  }

  async raiseDispute(bookingId: string, data: { reason: string; description?: string }) {
    return this.request(`/bookings/${bookingId}/disputes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getBookingDisputes(bookingId: string) {
    return this.request<Array<any>>(`/bookings/${bookingId}/disputes`);
  }

  async getMyDisputes() {
    return this.request<Array<any>>('/disputes/mine');
  }

  async getDispute(id: string) {
    return this.request(`/disputes/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Moderation Endpoints (Admin / Moderator)
  // ---------------------------------------------------------------------------

  async getModerationCases(params?: {
    status?: string;
    caseType?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.caseType) query.set('caseType', params.caseType);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString();
    return this.request<{ items: any[]; pagination: any }>(`/moderation/cases${qs ? `?${qs}` : ''}`);
  }

  async getModerationCase(id: string) {
    return this.request(`/moderation/cases/${id}`);
  }

  async claimModerationCase(id: string) {
    return this.request(`/moderation/cases/${id}/claim`, { method: 'POST' });
  }

  async resolveModerationCase(id: string, data: { resolution: string; notes?: string }) {
    return this.request(`/moderation/cases/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async dismissModerationCase(id: string, notes?: string) {
    return this.request(`/moderation/cases/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  async escalateModerationCase(id: string, data?: { notes?: string }) {
    return this.request(`/moderation/cases/${id}/escalate`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async approveVerification(id: string, notes?: string) {
    return this.request(`/moderation/verifications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  async rejectVerification(id: string, rejectionReason?: string) {
    return this.request(`/moderation/verifications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason }),
    });
  }

  async suspendUser(userId: string, reason: string) {
    return this.request(`/moderation/users/${userId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async reinstateUser(userId: string, reason?: string) {
    return this.request(`/moderation/users/${userId}/reinstate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async applyUserRestriction(userId: string, data: { restrictionType: string; reason: string; expiresAt?: string }) {
    return this.request(`/moderation/users/${userId}/restrictions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async revokeUserRestriction(userId: string, restrictionId: string) {
    return this.request(`/moderation/users/${userId}/restrictions/${restrictionId}`, {
      method: 'DELETE',
    });
  }

  async getUserRestrictions(userId: string) {
    return this.request<Array<any>>(`/moderation/users/${userId}/restrictions`);
  }

  async resolveModerationDispute(disputeId: string, data: { resolution: string; notes?: string }) {
    return this.request(`/moderation/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTrustAuditLogs(params?: { entityType?: string; actorId?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.actorId) query.set('actorId', params.actorId);
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString();
    return this.request<{ items: any[]; total: number }>(`/moderation/audit-logs${qs ? `?${qs}` : ''}`);
  }

  // ==========================================
  // Phase 14: Payment Infrastructure Methods
  // ==========================================

  async initiatePayment(data: {
    bookingId: string;
    amount: number;
    currency?: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentResponse> {
    return this.request<PaymentResponse>('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyPayments(params?: {
    page?: number;
    limit?: number;
    status?: string;
    bookingId?: string;
  }): Promise<{ data: PaymentResponse[]; total: number; page: number; limit: number }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);
    if (params?.bookingId) query.set('bookingId', params.bookingId);
    const qs = query.toString();
    return this.request<{ data: PaymentResponse[]; total: number; page: number; limit: number }>(
      `/payments/mine${qs ? `?${qs}` : ''}`,
    );
  }

  async getPaymentById(paymentId: string): Promise<PaymentResponse> {
    return this.request<PaymentResponse>(`/payments/${paymentId}`);
  }

  async getPaymentEvents(paymentId: string): Promise<PaymentEventResponse[]> {
    return this.request<PaymentEventResponse[]>(`/payments/${paymentId}/events`);
  }

  async requestRefund(
    paymentId: string,
    data: { amount: number; reason?: string; idempotencyKey: string },
  ): Promise<RefundResponse> {
    return this.request<RefundResponse>(`/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyPayouts(workerId?: string): Promise<PayoutResponse[]> {
    const query = new URLSearchParams();
    if (workerId) query.set('workerId', workerId);
    const qs = query.toString();
    return this.request<PayoutResponse[]>(`/payments/payouts/mine${qs ? `?${qs}` : ''}`);
  }

  async createPayout(data: {
    bookingId?: string;
    workerId: string;
    amount: number;
    currency?: string;
    idempotencyKey: string;
  }): Promise<PayoutResponse> {
    return this.request<PayoutResponse>('/payments/payouts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getReconciliationReport(): Promise<ReconciliationReport> {
    return this.request<ReconciliationReport>('/payments/reconciliation');
  }

  // ---------------------------------------------------------------------------
  // Admin Operations Dashboard API (Phase 15)
  // ---------------------------------------------------------------------------

  async getAdminOverview(params?: { startDate?: string; endDate?: string }): Promise<AdminOverviewMetrics> {
    const q = new URLSearchParams();
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    const qs = q.toString();
    return this.request<AdminOverviewMetrics>(`/admin/overview${qs ? `?${qs}` : ''}`);
  }

  async getAdminUsers(params?: AdminUserQuery): Promise<{ data: AdminUserItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.search) q.set('search', params.search);
    if (params?.role) q.set('role', params.role);
    if (params?.accountStatus) q.set('accountStatus', params.accountStatus);
    if (params?.verificationStatus) q.set('verificationStatus', params.verificationStatus);
    const qs = q.toString();
    return this.request(`/admin/users${qs ? `?${qs}` : ''}`);
  }

  async getAdminUserDetail(id: string): Promise<AdminUserDetail> {
    return this.request<AdminUserDetail>(`/admin/users/${id}`);
  }

  async suspendUserAdmin(id: string, body: SuspendUserDto): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/users/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async reinstateUserAdmin(id: string, body: ReinstateUserDto): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/users/${id}/reinstate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getAdminWorkers(params?: AdminWorkerQuery): Promise<{ data: AdminWorkerItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.search) q.set('search', params.search);
    if (params?.isAvailable !== undefined) q.set('isAvailable', String(params.isAvailable));
    if (params?.verificationStatus) q.set('verificationStatus', params.verificationStatus);
    if (params?.city) q.set('city', params.city);
    if (params?.skill) q.set('skill', params.skill);
    const qs = q.toString();
    return this.request(`/admin/workers${qs ? `?${qs}` : ''}`);
  }

  async getAdminEmployers(params?: AdminEmployerQuery): Promise<{ data: AdminEmployerItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.search) q.set('search', params.search);
    if (params?.accountStatus) q.set('accountStatus', params.accountStatus);
    if (params?.verificationStatus) q.set('verificationStatus', params.verificationStatus);
    if (params?.city) q.set('city', params.city);
    const qs = q.toString();
    return this.request(`/admin/employers${qs ? `?${qs}` : ''}`);
  }

  async getAdminJobs(params?: AdminJobQuery): Promise<{ data: AdminJobItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.category) q.set('category', params.category);
    if (params?.city) q.set('city', params.city);
    const qs = q.toString();
    return this.request(`/admin/jobs${qs ? `?${qs}` : ''}`);
  }

  async pauseAdminJob(id: string, body: PauseJobDto): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/jobs/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async resumeAdminJob(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/jobs/${id}/resume`, {
      method: 'POST',
    });
  }

  async getAdminReports(params?: AdminReportQuery): Promise<{ data: AdminReportItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.status) q.set('status', params.status);
    if (params?.targetType) q.set('targetType', params.targetType);
    const qs = q.toString();
    return this.request(`/admin/reports${qs ? `?${qs}` : ''}`);
  }

  async getAdminDisputes(params?: AdminDisputeQuery): Promise<{ data: AdminDisputeItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return this.request(`/admin/disputes${qs ? `?${qs}` : ''}`);
  }

  async getAdminVerifications(params?: AdminVerificationQuery): Promise<{ data: AdminVerificationItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return this.request(`/admin/verifications${qs ? `?${qs}` : ''}`);
  }

  async getAdminModeration(params?: AdminModerationQuery): Promise<{ data: AdminModerationItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.status) q.set('status', params.status);
    if (params?.priority) q.set('priority', params.priority);
    if (params?.caseType) q.set('caseType', params.caseType);
    const qs = q.toString();
    return this.request(`/admin/moderation${qs ? `?${qs}` : ''}`);
  }

  async claimModerationCaseAdmin(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/moderation/${id}/claim`, {
      method: 'POST',
    });
  }

  async resolveModerationCaseAdmin(id: string, action: string, notes?: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/moderation/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    });
  }

  async getAdminPayments(params?: AdminPaymentQuery): Promise<{ data: AdminPaymentItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return this.request(`/admin/payments${qs ? `?${qs}` : ''}`);
  }

  async getAdminAnalytics(timeframe?: string): Promise<AdminAnalyticsResponse> {
    const q = new URLSearchParams();
    if (timeframe) q.set('timeframe', timeframe);
    const qs = q.toString();
    return this.request(`/admin/analytics${qs ? `?${qs}` : ''}`);
  }

  async getProductAnalyticsMetrics(timeframe?: string): Promise<ProductAnalyticsDashboardData> {
    const q = new URLSearchParams();
    if (timeframe) q.set('timeframe', timeframe);
    const qs = q.toString();
    return this.request(`/analytics/admin/metrics${qs ? `?${qs}` : ''}`);
  }

  async getAdminAnalyticsEvents(params?: AdminAnalyticsEventQuery): Promise<AdminAnalyticsEventListResponse> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.eventName) q.set('eventName', params.eventName);
    if (params?.source) q.set('source', params.source);
    if (params?.platform) q.set('platform', params.platform);
    if (params?.userId) q.set('userId', params.userId);
    if (params?.anonymousSessionId) q.set('anonymousSessionId', params.anonymousSessionId);
    if (params?.correlationId) q.set('correlationId', params.correlationId);
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    const qs = q.toString();
    return this.request(`/analytics/admin/events${qs ? `?${qs}` : ''}`);
  }

  async getAdminSystemHealth(): Promise<AdminSystemHealthResponse> {
    return this.request<AdminSystemHealthResponse>('/admin/system-health');
  }

  async getCentralizedSystemHealth(): Promise<CentralizedSystemHealth> {
    return this.request<CentralizedSystemHealth>('/health/system');
  }

  async getActiveAlerts(): Promise<AlertEvaluationSummary> {
    return this.request<AlertEvaluationSummary>('/health/alerts');
  }

  async getReliabilityStatus(): Promise<{
    circuitBreakers: Record<string, CircuitBreakerStats>;
    metrics: {
      retryAttemptsTotal: number;
      retryExhaustedTotal: number;
      timeoutsTotal: number;
      circuitBreakersOpenTotal: number;
      circuitBreakersRejectedTotal: number;
      fallbacksTotal: number;
      deadlocksTotal: number;
      serializationFailuresTotal: number;
      poolExhaustionTotal: number;
      rateLimitExceededTotal: number;
    };
  }> {
    return this.request('/health/reliability');
  }

  async getDisasterRecoveryStatus(): Promise<DisasterRecoveryStatusResponse> {
    return this.request<DisasterRecoveryStatusResponse>('/health/disaster-recovery');
  }

  async getAdminAuditLogs(params?: AdminAuditLogQuery): Promise<{ data: AdminAuditLogItem[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', params.page.toString());
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.actorId) q.set('actorId', params.actorId);
    if (params?.action) q.set('action', params.action);
    if (params?.entityType) q.set('entityType', params.entityType);
    const qs = q.toString();
    return this.request(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
  }
}

export const workerApi = new ApiClient();
export const employerApi = new ApiClient();
export const adminApi = new ApiClient();
export const apiClient = new ApiClient();
export const messagingApi = apiClient;

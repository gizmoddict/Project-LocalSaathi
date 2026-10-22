// ==============================================================================
// LocalSaathi — Admin Metrics Service (Phase 15)
// PostgreSQL Aggregations for Live Dashboard KPIs & Domain Analytics
// ==============================================================================

import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  AdminOverviewMetrics,
  AdminAnalyticsResponse,
  UserRole,
  AccountStatus,
  JobStatus,
  ApplicationStatus,
  BookingStatus,
  DisputeStatus,
  VerificationStatus,
  ModerationCaseStatus,
} from '@localsaathi/types';
import { PaymentStatus, RefundStatus } from '@prisma/client';
import { CacheService } from '../../cache/cache.service';
import { CacheKeys } from '../../cache/cache-keys';
import { CACHE_CONSTANTS } from '../../cache/cache.constants';

@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /**
   * Derives real operational overview metrics from PostgreSQL with short-lived cache-aside.
   */
  async getOverviewMetrics(startDate?: Date, endDate?: Date): Promise<AdminOverviewMetrics> {
    if (startDate || endDate || !this.cacheService) {
      return this.computeOverviewMetrics(startDate, endDate);
    }
    return this.cacheService.wrap(
      CacheKeys.adminOverviewMetrics(),
      () => this.computeOverviewMetrics(),
      {
        ttl: CACHE_CONSTANTS.TTL.ADMIN_METRICS,
        stampedeProtect: true,
      },
    );
  }

  private async computeOverviewMetrics(startDate?: Date, endDate?: Date): Promise<AdminOverviewMetrics> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dateFilter = startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {};

    const [
      dauCount,
      mauCount,
      registeredWorkers,
      registeredEmployers,
      activeWorkers,
      activeEmployers,
      activeJobs,
      jobsCreated,
      jobsCompleted,
      totalApplications,
      acceptedApplications,
      totalBookings,
      completedBookings,
      capturedPaymentsAgg,
      failedPaymentsCount,
      refundsAgg,
      totalReportsCount,
      suspendedUsersCount,
      activeDisputesCount,
      pendingVerificationsCount,
      pendingModerationCasesCount,
    ] = await Promise.all([
      // 1. DAU: distinct users active in last 24h (Direct SQL Count without Heap Allocation)
      this.prisma.$queryRaw<Array<{ count: string }>>`
        SELECT COUNT(DISTINCT user_id)::text AS count
        FROM sessions
        WHERE last_used_at >= ${oneDayAgo} AND revoked_at IS NULL;
      `.then(([r]) => Number(r?.count ?? 0)),
      // 2. MAU: distinct users active in last 30d (Direct SQL Count without Heap Allocation)
      this.prisma.$queryRaw<Array<{ count: string }>>`
        SELECT COUNT(DISTINCT user_id)::text AS count
        FROM sessions
        WHERE last_used_at >= ${thirtyDaysAgo} AND revoked_at IS NULL;
      `.then(([r]) => Number(r?.count ?? 0)),
      // 3. Registered Workers
      this.prisma.user.count({ where: { role: UserRole.WORKER } }),
      // 4. Registered Employers
      this.prisma.user.count({ where: { role: UserRole.EMPLOYER } }),
      // 5. Active Workers
      this.prisma.workerProfile.count({
        where: {
          isAvailable: true,
          user: { accountStatus: AccountStatus.ACTIVE },
        },
      }),
      // 6. Active Employers
      this.prisma.employerProfile.count({
        where: { user: { accountStatus: AccountStatus.ACTIVE } },
      }),
      // 7. Active Jobs
      this.prisma.jobPost.count({ where: { status: JobStatus.PUBLISHED } }),
      // 8. Jobs Created
      this.prisma.jobPost.count({ where: dateFilter }),
      // 9. Jobs Completed
      this.prisma.jobPost.count({ where: { status: JobStatus.COMPLETED, ...dateFilter } }),
      // 10. Total Applications
      this.prisma.jobApplication.count({ where: dateFilter }),
      // 11. Accepted Applications (Hires)
      this.prisma.jobApplication.count({
        where: { status: ApplicationStatus.ACCEPTED, ...dateFilter },
      }),
      // 12. Total Bookings
      this.prisma.booking.count({ where: dateFilter }),
      // 13. Completed Bookings
      this.prisma.booking.count({
        where: { status: BookingStatus.COMPLETED, ...dateFilter },
      }),
      // 14. Captured Payments Aggregation
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, ...dateFilter },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // 15. Failed Payments Count
      this.prisma.payment.count({
        where: { status: PaymentStatus.FAILED, ...dateFilter },
      }),
      // 16. Refunds Aggregation
      this.prisma.refund.aggregate({
        where: { status: RefundStatus.SUCCEEDED, ...dateFilter },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // 17. Reports Count
      this.prisma.report.count({ where: dateFilter }),
      // 18. Suspended Users Count
      this.prisma.user.count({ where: { accountStatus: AccountStatus.SUSPENDED } }),
      // 19. Active Disputes Count
      this.prisma.dispute.count({
        where: { status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] } },
      }),
      // 20. Pending Verifications Count
      this.prisma.identityVerification.count({
        where: { status: { in: [VerificationStatus.PENDING, VerificationStatus.UNDER_REVIEW] } },
      }),
      // 21. Pending Moderation Cases Count
      this.prisma.moderationCase.count({
        where: {
          status: { in: [ModerationCaseStatus.PENDING, ModerationCaseStatus.UNDER_REVIEW] },
        },
      }),
    ]);

    // Calculate Ratios
    const applicationToHireRate =
      totalApplications > 0
        ? Number(((acceptedApplications / totalApplications) * 100).toFixed(1))
        : 0;

    const matchRate =
      activeJobs > 0
        ? Number((totalApplications / activeJobs).toFixed(2))
        : 0;

    const bookingCompletionRate =
      totalBookings > 0
        ? Number(((completedBookings / totalBookings) * 100).toFixed(1))
        : 0;

    // Estimate average response time from processed applications
    const sampleApplications = await this.prisma.jobApplication.findMany({
      where: {
        status: { not: ApplicationStatus.APPLIED },
      },
      select: { appliedAt: true, updatedAt: true },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });

    let avgResponseTimeHours = 0;
    if (sampleApplications.length > 0) {
      const totalHours = sampleApplications.reduce((acc, app) => {
        const diffMs = app.updatedAt.getTime() - app.appliedAt.getTime();
        return acc + diffMs / (1000 * 60 * 60);
      }, 0);
      avgResponseTimeHours = Number((totalHours / sampleApplications.length).toFixed(1));
    }

    return {
      dau: dauCount,
      mau: mauCount,
      registeredWorkers,
      registeredEmployers,
      activeWorkers,
      activeEmployers,
      activeJobs,
      jobsCreated,
      jobsCompleted,
      totalApplications,
      applicationToHireRate,
      matchRate,
      bookingCompletionRate,
      avgResponseTimeHours,
      totalPaymentVolumeInr: Number(capturedPaymentsAgg._sum.amount || 0),
      successfulPaymentsCount: capturedPaymentsAgg._count.id || 0,
      failedPaymentsCount,
      totalRefundsVolumeInr: Number(refundsAgg._sum.amount || 0),
      successfulRefundsCount: refundsAgg._count.id || 0,
      totalReportsCount,
      suspendedUsersCount,
      activeDisputesCount,
      pendingVerificationsCount,
      pendingModerationCasesCount,
      timestamp: now.toISOString(),
    };
  }

  /**
   * Provides domain breakdown analytics derived from transactional data.
   */
  async getAnalytics(timeframe = '30d'): Promise<AdminAnalyticsResponse> {
    const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersPast30Days,
      totalWorkers,
      totalEmployers,
      totalPostedJobs,
      publishedRecentJobs,
      filledRecentJobs,
      totalApps,
      shortlistedApps,
      acceptedHires,
      totalBookings,
      completedBookings,
      paymentAgg,
      totalRefundsCount,
      totalReports,
      totalDisputes,
      totalSuspensions,
      resolvedCases,
      totalCases,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: sinceDate } } }),
      this.prisma.user.count({ where: { role: UserRole.WORKER } }),
      this.prisma.user.count({ where: { role: UserRole.EMPLOYER } }),
      this.prisma.jobPost.count(),
      this.prisma.jobPost.count({ where: { createdAt: { gte: sinceDate } } }),
      this.prisma.jobPost.count({ where: { status: JobStatus.FILLED, createdAt: { gte: sinceDate } } }),
      this.prisma.jobApplication.count({ where: { appliedAt: { gte: sinceDate } } }),
      this.prisma.jobApplication.count({
        where: { status: ApplicationStatus.SHORTLISTED, appliedAt: { gte: sinceDate } },
      }),
      this.prisma.jobApplication.count({
        where: { status: ApplicationStatus.ACCEPTED, appliedAt: { gte: sinceDate } },
      }),
      this.prisma.booking.count({ where: { createdAt: { gte: sinceDate } } }),
      this.prisma.booking.count({
        where: { status: BookingStatus.COMPLETED, createdAt: { gte: sinceDate } },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: sinceDate } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.refund.count({ where: { createdAt: { gte: sinceDate } } }),
      this.prisma.report.count({ where: { createdAt: { gte: sinceDate } } }),
      this.prisma.dispute.count({ where: { createdAt: { gte: sinceDate } } }),
      this.prisma.user.count({ where: { accountStatus: AccountStatus.SUSPENDED } }),
      this.prisma.moderationCase.count({
        where: { status: ModerationCaseStatus.RESOLVED, createdAt: { gte: sinceDate } },
      }),
      this.prisma.moderationCase.count({ where: { createdAt: { gte: sinceDate } } }),
    ]);

    const totalCaptured = Number(paymentAgg._sum.amount || 0);
    const txCount = paymentAgg._count.id || 0;

    return {
      timeframe,
      users: {
        totalRegistered: totalUsers,
        newUsersPast30Days,
        workerRatio: totalUsers > 0 ? Number(((totalWorkers / totalUsers) * 100).toFixed(1)) : 0,
        employerRatio: totalUsers > 0 ? Number(((totalEmployers / totalUsers) * 100).toFixed(1)) : 0,
      },
      jobs: {
        totalPosted: totalPostedJobs,
        publishedPast30Days: publishedRecentJobs,
        fillRatePercentage:
          publishedRecentJobs > 0
            ? Number(((filledRecentJobs / publishedRecentJobs) * 100).toFixed(1))
            : 0,
      },
      funnel: {
        totalApplications: totalApps,
        shortlistedApplications: shortlistedApps,
        acceptedHires,
        applicationToHirePercentage:
          totalApps > 0 ? Number(((acceptedHires / totalApps) * 100).toFixed(1)) : 0,
        totalBookings,
        completedBookings,
        bookingCompletionPercentage:
          totalBookings > 0 ? Number(((completedBookings / totalBookings) * 100).toFixed(1)) : 0,
      },
      payments: {
        totalVolumeInr: totalCaptured,
        totalTransactions: txCount,
        averageTransactionValueInr: txCount > 0 ? Number((totalCaptured / txCount).toFixed(2)) : 0,
        refundRatePercentage:
          txCount > 0 ? Number(((totalRefundsCount / txCount) * 100).toFixed(1)) : 0,
      },
      safety: {
        totalReports,
        totalDisputes,
        totalSuspensions,
        moderationResolutionRatePercentage:
          totalCases > 0 ? Number(((resolvedCases / totalCases) * 100).toFixed(1)) : 100,
      },
    };
  }
}

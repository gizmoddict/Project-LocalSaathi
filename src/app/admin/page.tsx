'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminOverviewMetrics } from '@localsaathi/types';
import { MetricCard } from '@/components/admin/MetricCard';
import {
  Users,
  Briefcase,
  Building2,
  FileText,
  FileCheck2,
  Percent,
  CreditCard,
  AlertTriangle,
  Scale,
  ShieldAlert,
  Clock,
  RotateCcw,
} from 'lucide-react';

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<AdminOverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getAdminOverview();
      setMetrics(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load overview metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Platform Overview</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time platform performance & operational key metrics.
          </p>
        </div>
        <button
          onClick={fetchOverview}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Daily Active Users"
          value={metrics ? metrics.dau : '-'}
          subtitle={`MAU: ${metrics?.mau ?? '-'}`}
          icon={Users}
          variant="purple"
        />
        <MetricCard
          title="Registered Workers"
          value={metrics ? metrics.registeredWorkers : '-'}
          subtitle={`Active: ${metrics?.activeWorkers ?? '-'}`}
          icon={Briefcase}
          variant="success"
        />
        <MetricCard
          title="Registered Employers"
          value={metrics ? metrics.registeredEmployers : '-'}
          subtitle={`Active: ${metrics?.activeEmployers ?? '-'}`}
          icon={Building2}
          variant="default"
        />
        <MetricCard
          title="Total Jobs Created"
          value={metrics ? metrics.jobsCreated : '-'}
          subtitle={`Active: ${metrics?.activeJobs ?? '-'} | Completed: ${metrics?.jobsCompleted ?? '-'}`}
          icon={FileText}
          variant="default"
        />
      </div>

      {/* Operational Conversion & Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Deterministic Match Rate"
          value={metrics ? `${metrics.matchRate}%` : '-'}
          subtitle="Qualified applications ratio"
          icon={Percent}
          variant="success"
        />
        <MetricCard
          title="Hire Rate"
          value={metrics ? `${metrics.applicationToHireRate}%` : '-'}
          subtitle="Accepted vs total applicants"
          icon={FileCheck2}
          variant="purple"
        />
        <MetricCard
          title="Booking Completion Rate"
          value={metrics ? `${metrics.bookingCompletionRate}%` : '-'}
          subtitle="Fulfilled bookings ratio"
          icon={Percent}
          variant="success"
        />
        <MetricCard
          title="Avg Response Time"
          value={metrics ? `${metrics.avgResponseTimeHours}h` : '-'}
          subtitle="Time to first application review"
          icon={Clock}
          variant="default"
        />
      </div>

      {/* Financial & Trust Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Gross Transaction Value"
          value={metrics ? `₹${(metrics.totalPaymentVolumeInr / 100).toLocaleString()}` : '-'}
          subtitle={`Successful Payments: ${metrics?.successfulPaymentsCount ?? '-'}`}
          icon={CreditCard}
          variant="success"
        />
        <MetricCard
          title="Pending Verifications"
          value={metrics ? metrics.pendingVerificationsCount : '-'}
          subtitle="Worker & employer ID reviews"
          icon={ShieldAlert}
          variant="warning"
        />
        <MetricCard
          title="Open Abuse Reports"
          value={metrics ? metrics.totalReportsCount : '-'}
          subtitle="Pending trust review"
          icon={AlertTriangle}
          variant={metrics && metrics.totalReportsCount > 0 ? 'danger' : 'default'}
        />
        <MetricCard
          title="Open Disputes"
          value={metrics ? metrics.activeDisputesCount : '-'}
          subtitle="Mediation & resolution queue"
          icon={Scale}
          variant={metrics && metrics.activeDisputesCount > 0 ? 'warning' : 'default'}
        />
      </div>
    </div>
  );
}

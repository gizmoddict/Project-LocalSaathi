'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@localsaathi/ui';
import {
  Briefcase,
  MapPin,
  IndianRupee,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Building2,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { workerApi } from '@/lib/api-client';
import { WorkerApplicationSummary, ApplicationStatus } from '@localsaathi/types';

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All Applications', value: 'ALL' },
  { label: 'Applied', value: 'APPLIED' },
  { label: 'Shortlisted', value: 'SHORTLISTED' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Withdrawn', value: 'WITHDRAWN' },
];

export default function WorkerApplicationsPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [applications, setApplications] = useState<WorkerApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const loadApplications = async (statusFilter?: string) => {
    setLoading(true);
    setError(null);
    try {
      const status = statusFilter && statusFilter !== 'ALL' ? (statusFilter as ApplicationStatus) : undefined;
      const res = await workerApi.getWorkerApplications({ status });
      setApplications(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load your applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications(selectedStatus);
  }, [selectedStatus]);

  const handleWithdraw = async (applicationId: string, jobTitle: string) => {
    if (!confirm(`Are you sure you want to withdraw your application for "${jobTitle}"?`)) {
      return;
    }

    setWithdrawingId(applicationId);
    setActionSuccess(null);
    setError(null);

    try {
      await workerApi.withdrawApplication(applicationId);
      setActionSuccess(`Application for "${jobTitle}" withdrawn.`);
      await loadApplications(selectedStatus);
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw application.');
    } finally {
      setWithdrawingId(null);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case 'APPLIED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Applied
          </span>
        );
      case 'SHORTLISTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            ★ Shortlisted
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Accepted / Hired
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Not Selected
          </span>
        );
      case 'WITHDRAWN':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Withdrawn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">My Job Applications</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
              Phase 7 Live
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track real-time status of your applications submitted to verified local employers.
          </p>
        </div>
        <Link href="/worker/jobs">
          <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-slate-700">
            <Briefcase className="w-4 h-4 text-emerald-600" />
            Discover More Jobs
          </Button>
        </Link>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 border-b border-slate-200">
        {STATUS_TABS.map((tab) => {
          const isActive = selectedStatus === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setSelectedStatus(tab.value)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Application List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 rounded w-1/3"></div>
              <div className="h-4 bg-slate-100 rounded w-1/2"></div>
              <div className="h-10 bg-slate-50 rounded"></div>
            </div>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            {selectedStatus === 'ALL'
              ? 'No applications yet'
              : `No applications with status "${selectedStatus}"`}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Find jobs matching your skills and location, and submit your application with a single click.
          </p>
          <Link href="/worker/jobs">
            <Button variant="primary" size="md">
              Browse Available Jobs <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const canWithdraw = app.status === 'APPLIED' || app.status === 'SHORTLISTED';
            const isWithdrawing = withdrawingId === app.id;

            return (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left Side: Job Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(app.status)}
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {app.jobCategory}
                      </span>
                      {app.matchScore !== null && app.matchScore !== undefined && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Sparkles className="w-3 h-3" />
                          {app.matchScore}% Match
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg font-bold text-slate-900">
                      <Link
                        href={`/worker/jobs/${app.jobId}`}
                        className="hover:text-emerald-600 transition-colors"
                      >
                        {app.jobTitle}
                      </Link>
                    </h2>

                    <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                      <span className="flex items-center gap-1 font-medium text-slate-800">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {app.employerBusinessName}
                      </span>
                      {(app.employerLocality || app.employerCity) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500" />
                          {[app.employerLocality, app.employerCity].filter(Boolean).join(', ')}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-semibold text-emerald-700">
                        <IndianRupee className="w-3.5 h-3.5" />
                        ₹{app.wageAmount} / {app.wageType}
                      </span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        Applied: {new Date(app.appliedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                    <Link href={`/worker/jobs/${app.jobId}`}>
                      <Button variant="outline" size="sm" className="flex items-center gap-1 text-xs">
                        View Job Details
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>

                    {canWithdraw && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isWithdrawing}
                        onClick={() => handleWithdraw(app.id, app.jobTitle)}
                        className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                      >
                        {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

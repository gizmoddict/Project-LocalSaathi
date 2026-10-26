'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@localsaathi/ui';
import {
  ArrowLeft,
  Users,
  Star,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MapPin,
  IndianRupee,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Briefcase,
} from 'lucide-react';
import { employerApi } from '@/lib/api-client';
import {
  EmployerApplicationItem,
  EmployerApplicationMetrics,
  ApplicationStatus,
  JobResponse,
} from '@localsaathi/types';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All Applicants', value: 'ALL' },
  { label: 'Pending (Applied)', value: 'APPLIED' },
  { label: 'Shortlisted', value: 'SHORTLISTED' },
  { label: 'Accepted / Hired', value: 'ACCEPTED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Withdrawn', value: 'WITHDRAWN' },
];

export default function EmployerJobApplicationsPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<JobResponse | null>(null);
  const [applications, setApplications] = useState<EmployerApplicationItem[]>([]);
  const [metrics, setMetrics] = useState<EmployerApplicationMetrics>({
    total: 0,
    pending: 0,
    shortlisted: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
  });

  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'match_score_desc' | 'applied_at_desc' | 'distance_asc'>(
    'match_score_desc'
  );
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [expandedScoreIds, setExpandedScoreIds] = useState<Record<string, boolean>>({});

  const loadData = async (statusFilter?: string, currentSort?: typeof sortBy) => {
    if (!jobId) return;
    setLoading(true);
    setActionError(null);

    try {
      const status = statusFilter && statusFilter !== 'ALL' ? (statusFilter as ApplicationStatus) : undefined;
      const [jobData, appData] = await Promise.all([
        employerApi.getJobById(jobId),
        employerApi.getJobApplications(jobId, { status, sort: currentSort || sortBy }),
      ]);
      setJob(jobData);
      setApplications(appData.items || []);
      setMetrics(
        appData.metrics || {
          total: 0,
          pending: 0,
          shortlisted: 0,
          accepted: 0,
          rejected: 0,
          withdrawn: 0,
        }
      );
    } catch (err: any) {
      setActionError(err.message || 'Failed to load applicant list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedStatus, sortBy);
  }, [jobId, selectedStatus, sortBy]);

  const toggleScore = (appId: string) => {
    setExpandedScoreIds((prev) => ({
      ...prev,
      [appId]: !prev[appId],
    }));
  };

  const handleShortlist = async (appId: string, workerName: string) => {
    setOperatingId(appId);
    setActionSuccess(null);
    setActionError(null);
    try {
      await employerApi.shortlistApplication(appId);
      setActionSuccess(`Applicant ${workerName} has been shortlisted.`);
      await loadData(selectedStatus, sortBy);
    } catch (err: any) {
      setActionError(err.message || 'Failed to shortlist applicant.');
    } finally {
      setOperatingId(null);
    }
  };

  const handleReject = async (appId: string, workerName: string) => {
    if (!confirm(`Are you sure you want to mark ${workerName} as rejected for this job?`)) {
      return;
    }
    setOperatingId(appId);
    setActionSuccess(null);
    setActionError(null);
    try {
      await employerApi.rejectApplication(appId);
      setActionSuccess(`Applicant ${workerName} has been rejected.`);
      await loadData(selectedStatus, sortBy);
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject applicant.');
    } finally {
      setOperatingId(null);
    }
  };

  const handleAccept = async (appId: string, workerName: string) => {
    if (!confirm(`Confirm hiring ${workerName}? This marks the application as ACCEPTED.`)) {
      return;
    }
    setOperatingId(appId);
    setActionSuccess(null);
    setActionError(null);
    try {
      await employerApi.acceptApplication(appId);
      setActionSuccess(`Applicant ${workerName} has been accepted / hired for this job!`);
      await loadData(selectedStatus, sortBy);
    } catch (err: any) {
      setActionError(err.message || 'Failed to accept applicant.');
    } finally {
      setOperatingId(null);
    }
  };

  const handleCreateBooking = async (appId: string, workerName: string) => {
    setOperatingId(appId);
    setActionSuccess(null);
    setActionError(null);
    try {
      const booking = await employerApi.createBooking(appId);
      setActionSuccess(`Contract agreement initiated for ${workerName}! Opening details...`);
      router.push(`/employer/bookings/${booking.id}`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to initiate booking contract.');
      setOperatingId(null);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case 'APPLIED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Pending Review
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
            Rejected
          </span>
        );
      case 'WITHDRAWN':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Worker Withdrawn
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href={`/employer/jobs/${jobId}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Job Details
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">
              Applicants for &ldquo;{job?.title || 'Job'}&rdquo;
            </h1>
            {job && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
                {job.status}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Review applicant profiles, deterministic match scores, and manage hiring pipeline states.
          </p>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Total Applicants</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
          <p className="text-xs text-blue-600 font-medium">Pending Review</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{metrics.pending}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
          <p className="text-xs text-amber-600 font-medium">Shortlisted</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.shortlisted}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
          <p className="text-xs text-emerald-600 font-medium">Accepted</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{metrics.accepted}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm">
          <p className="text-xs text-rose-600 font-medium">Rejected</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">{metrics.rejected}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-400 font-medium">Withdrawn</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{metrics.withdrawn}</p>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span className="text-sm font-medium">{actionError}</span>
        </div>
      )}

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((filter) => {
            const isActive = selectedStatus === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => setSelectedStatus(filter.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="match_score_desc">Highest Match Score</option>
            <option value="applied_at_desc">Newest Applied Date</option>
            <option value="distance_asc">Closest Distance</option>
          </select>
        </div>
      </div>

      {/* Applicant Cards List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-4">
              <div className="h-6 bg-slate-200 rounded w-1/4"></div>
              <div className="h-4 bg-slate-100 rounded w-1/2"></div>
              <div className="h-12 bg-slate-50 rounded"></div>
            </div>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            {selectedStatus === 'ALL'
              ? 'No applicants yet'
              : `No applicants with status "${selectedStatus}"`}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {job?.status === 'PUBLISHED'
              ? 'Qualified workers in your locality will discover your job and submit applications soon.'
              : 'Publish this job post to make it discoverable to nearby skilled workers.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const isOperating = operatingId === app.id;
            const isExpanded = !!expandedScoreIds[app.id];

            return (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                  {/* Left Column: Worker Info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-900">
                        {app.worker.displayName}
                      </h2>
                      {getStatusBadge(app.status)}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Sparkles className="w-3 h-3" />
                        {app.match.score}% Match
                      </span>
                    </div>

                    {/* Metadata chips */}
                    <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                      <span className="flex items-center gap-1 font-medium text-slate-800">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        {app.worker.experienceYears} Years Exp
                      </span>
                      {app.worker.expectedWage && (
                        <span className="flex items-center gap-1 font-semibold text-emerald-700">
                          <IndianRupee className="w-3.5 h-3.5" />
                          Expected: ₹{app.worker.expectedWage} / {app.worker.wageType || 'DAY'}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        {[app.worker.locality, app.worker.city].filter(Boolean).join(', ') || 'Hyperlocal Area'}{' '}
                        <span className="text-slate-400">
                          ({app.distanceKm.toFixed(1)} km from job site)
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        Applied: {new Date(app.appliedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Skills list */}
                    {app.worker.skills && app.worker.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {app.worker.skills.map((skill) => (
                          <span
                            key={skill.skillId}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium"
                          >
                            <span>{skill.name}</span>
                            <span className="text-[10px] text-slate-400">({skill.proficiency})</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Worker Cover Note */}
                    {app.applicationMessage && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900 block mb-0.5">Worker Note:</span>
                        <p className="italic">{app.applicationMessage}</p>
                      </div>
                    )}

                    {/* Match Score Breakdown Toggle */}
                    <div className="pt-2">
                      <button
                        onClick={() => toggleScore(app.id)}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Hide Match Explanation
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> View Match Score Breakdown
                          </>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <div>
                            <span className="text-[11px] text-slate-500 block">Proximity</span>
                            <span className="font-bold text-slate-900">
                              {app.match.breakdown.distanceScore} / 30 pts
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Skills</span>
                            <span className="font-bold text-slate-900">
                              {app.match.breakdown.skillScore} / 35 pts
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Experience</span>
                            <span className="font-bold text-slate-900">
                              {app.match.breakdown.experienceScore} / 15 pts
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Wage Alignment</span>
                            <span className="font-bold text-slate-900">
                              {app.match.breakdown.wageScore} / 10 pts
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Availability</span>
                            <span className="font-bold text-slate-900">
                              {app.match.breakdown.availabilityScore} / 10 pts
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: FSM Action Buttons */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {/* Status: APPLIED -> can Shortlist or Reject */}
                    {app.status === 'APPLIED' && (
                      <>
                        <Button
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleShortlist(app.id, app.worker.displayName)}
                          className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 text-xs"
                        >
                          <Star className="w-3.5 h-3.5" /> Shortlist
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleReject(app.id, app.worker.displayName)}
                          className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </>
                    )}

                    {/* Status: SHORTLISTED -> can Accept or Reject */}
                    {app.status === 'SHORTLISTED' && (
                      <>
                        <Button
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleAccept(app.id, app.worker.displayName)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 text-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept / Hire
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleReject(app.id, app.worker.displayName)}
                          className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </>
                    )}

                    {/* Terminal States */}
                    {app.status === 'ACCEPTED' && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Worker Hired
                        </span>
                        <Button
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleCreateBooking(app.id, app.worker.displayName)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs shadow-sm"
                        >
                          <Briefcase className="w-3.5 h-3.5" /> Create Booking
                        </Button>
                      </div>
                    )}

                    {app.status === 'REJECTED' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                        <XCircle className="w-4 h-4 text-rose-600" />
                        Application Closed
                      </span>
                    )}

                    {app.status === 'WITHDRAWN' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                        Worker Withdrew
                      </span>
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

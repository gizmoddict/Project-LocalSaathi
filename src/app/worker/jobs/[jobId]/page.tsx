'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { workerApi } from '@/lib/api-client';
import { WorkerJobDetailResponse, WorkerApplicationDetail, ApplicationStatus } from '@localsaathi/types';

export default function WorkerJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<WorkerJobDetailResponse | null>(null);
  const [application, setApplication] = useState<WorkerApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      workerApi.getWorkerJobDetail(jobId),
      workerApi.getWorkerApplicationForJob(jobId).catch(() => null),
    ])
      .then(([jobData, appData]) => {
        setJob(jobData);
        setApplication(appData);
      })
      .catch((err) => {
        setError(err.message || 'Job post not found or no longer active.');
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId) return;

    setApplying(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await workerApi.applyToJob(jobId, message.trim() || undefined);
      setActionSuccess('Application submitted successfully! The employer can now review your profile.');
      const updated = await workerApi.getWorkerApplicationForJob(jobId);
      setApplication(updated);
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit application.');
    } finally {
      setApplying(false);
    }
  };

  const handleWithdraw = async () => {
    if (!application) return;
    if (!confirm('Are you sure you want to withdraw your application for this job?')) return;

    setWithdrawing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updated = await workerApi.withdrawApplication(application.id);
      setApplication(updated);
      setActionSuccess('Your application has been withdrawn.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to withdraw application.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="h-6 bg-slate-200 rounded w-1/4 animate-pulse"></div>
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-1/2"></div>
            <div className="h-4 bg-slate-100 rounded w-3/4"></div>
            <div className="h-24 bg-slate-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-bold text-slate-900">Job Unavailable</h2>
          <p className="text-sm text-slate-600">{error || 'This job is no longer available or was closed.'}</p>
          <button
            onClick={() => router.push('/worker/jobs')}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition"
          >
            &larr; Back to Job Discovery
          </button>
        </div>
      </div>
    );
  }

  const { match, breakdown } = { match: job.match, breakdown: job.match.breakdown };
  const isHighMatch = match.score >= 80;
  const isMediumMatch = match.score >= 50 && match.score < 80;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <Link href="/worker" className="hover:text-emerald-600 transition">
            Worker Dashboard
          </Link>
          <span>/</span>
          <Link href="/worker/jobs" className="hover:text-emerald-600 transition">
            Job Discovery
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-medium truncate">{job.title}</span>
        </div>

        {/* Top Header Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {job.category}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  📍 {job.distanceKm} km away
                </span>
                {job.urgency === 'IMMEDIATE' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800">
                    Immediate Start
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {job.title}
              </h1>
              <div className="text-sm text-slate-600">
                Posted by <span className="font-semibold text-slate-800">{job.employer.businessName}</span> in{' '}
                <span className="text-slate-800">{job.location.locality}, {job.location.city}</span>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0 bg-slate-50 sm:bg-transparent p-4 sm:p-0 rounded-xl sm:rounded-none">
              <div className="text-2xl sm:text-3xl font-black text-slate-900">
                ₹{job.wageAmount.toLocaleString('en-IN')}
              </div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                per {job.wageType.toLowerCase()}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                📅 Duration: {job.durationDays} day(s)
              </div>
            </div>
          </div>
        </div>

        {/* Application Status & Action Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>📋</span> Application Status
            </h2>
            {application && (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                  application.status === ApplicationStatus.ACCEPTED
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : application.status === ApplicationStatus.SHORTLISTED
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : application.status === ApplicationStatus.APPLIED
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                {application.status}
              </span>
            )}
          </div>

          {actionSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
              ✓ {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              ⚠️ {actionError}
            </div>
          )}

          {application ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2 text-sm">
                <div className="text-slate-700">
                  {application.status === ApplicationStatus.APPLIED && (
                    <span>Application submitted. The employer will review your profile and matching qualifications.</span>
                  )}
                  {application.status === ApplicationStatus.SHORTLISTED && (
                    <span className="text-amber-800 font-medium">
                      🎉 Your application has been shortlisted by the employer!
                    </span>
                  )}
                  {application.status === ApplicationStatus.ACCEPTED && (
                    <span className="text-emerald-800 font-medium">
                      ✓ Your application has been accepted! The employer has selected you for this job.
                    </span>
                  )}
                  {application.status === ApplicationStatus.REJECTED && (
                    <span className="text-slate-600">
                      The employer has reviewed applicants and closed this opening without selection.
                    </span>
                  )}
                  {application.status === ApplicationStatus.WITHDRAWN && (
                    <span className="text-slate-600">
                      You withdrew your application on {application.withdrawnAt ? new Date(application.withdrawnAt).toLocaleDateString() : 'earlier date'}.
                    </span>
                  )}
                </div>

                {application.applicationMessage && (
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-600">Your note: </span>
                    &ldquo;{application.applicationMessage}&rdquo;
                  </div>
                )}

                <div className="text-xs text-slate-400">
                  Applied on: {new Date(application.appliedAt).toLocaleString()}
                </div>
              </div>

              {(application.status === ApplicationStatus.APPLIED ||
                application.status === ApplicationStatus.SHORTLISTED) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition disabled:opacity-50"
                  >
                    {withdrawing ? 'Withdrawing...' : 'Withdraw Application'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleApply} className="space-y-4">
              <p className="text-sm text-slate-600">
                You haven&apos;t applied to this job yet. Submit your application below to share your verified profile and matching qualifications with the employer.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Introductory Note / Message (Optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. Certified technician with 5 years experience, immediate availability with personal tools..."
                  rows={3}
                  maxLength={1000}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  {match.score}% Match compatibility based on your location and skills
                </span>
                <button
                  type="submit"
                  disabled={applying}
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
                >
                  {applying ? 'Submitting Application...' : 'Apply for this Job'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Deterministic Match Evaluation Breakdown */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Deterministic Match Analysis</span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isHighMatch
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : isMediumMatch
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  ⚡ {match.score}% Overall Match
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Computed transparently using PostGIS distance, skill coverage, tenure, availability, and wage compatibility.
              </p>
            </div>

            <div className="shrink-0">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${
                  match.eligible
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {match.eligible ? '✓ Eligible for Application' : '⚠ Non-Optimal Match'}
              </span>
            </div>
          </div>

          {/* 5-Dimension Score Progress Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Distance */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 uppercase">Distance (30%)</div>
              <div className="text-lg font-bold text-slate-900">{breakdown.distanceScore}%</div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${breakdown.distanceScore}%` }}></div>
              </div>
              <div className="text-[11px] text-slate-500">{breakdown.distanceKm} km away</div>
            </div>

            {/* Skills */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 uppercase">Skills (35%)</div>
              <div className="text-lg font-bold text-slate-900">{breakdown.skillScore}%</div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${breakdown.skillScore}%` }}></div>
              </div>
              <div className="text-[11px] text-slate-500">
                {breakdown.matchedSkillsCount}/{breakdown.totalRequiredSkillsCount} matched
              </div>
            </div>

            {/* Experience */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 uppercase">Tenure (15%)</div>
              <div className="text-lg font-bold text-slate-900">{breakdown.experienceScore}%</div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-purple-600 h-1.5 rounded-full" style={{ width: `${breakdown.experienceScore}%` }}></div>
              </div>
              <div className="text-[11px] text-slate-500">
                {breakdown.experienceMet ? 'Meets reqs' : 'Partial reqs'}
              </div>
            </div>

            {/* Availability */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 uppercase">Schedule (10%)</div>
              <div className="text-lg font-bold text-slate-900">{breakdown.availabilityScore}%</div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-teal-600 h-1.5 rounded-full" style={{ width: `${breakdown.availabilityScore}%` }}></div>
              </div>
              <div className="text-[11px] text-slate-500">
                {breakdown.availabilityCompatible ? 'Compatible' : 'Conflict'}
              </div>
            </div>

            {/* Wage */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 uppercase">Wage (10%)</div>
              <div className="text-lg font-bold text-slate-900">{breakdown.wageScore}%</div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-amber-600 h-1.5 rounded-full" style={{ width: `${breakdown.wageScore}%` }}></div>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {breakdown.wageCompatible === true ? 'Meets expectation' : 'Review wage'}
              </div>
            </div>
          </div>

          {/* Explainable Reasons List */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Match Reasons Breakdown
            </h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              {match.reasons.map((r, i) => (
                <div key={i} className="flex items-start space-x-2 text-xs text-slate-700">
                  <span className="text-emerald-600 font-bold shrink-0">✓</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Skill-by-Skill Comparison Table */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Required Skills Comparison</h2>
          <p className="text-xs text-slate-500">
            A granular comparison of the employer&apos;s required skills against your verified profile credentials.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">Skill Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">Min Experience Required</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">Your Profile</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 text-xs uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {job.skillDetails.map((s) => (
                  <tr key={s.skillId} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 text-slate-500">{s.category}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.minExperienceYears > 0 ? `${s.minExperienceYears} year(s)` : 'None'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.workerHasSkill ? (
                        <span>
                          {s.workerExperienceYears} yr(s) ({s.workerProficiency})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not listed on your profile</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.workerHasSkill ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-500">
                          Missing
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Job Description & Schedule */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Description & Details */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Job Description</h2>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {job.description}
            </p>

            {job.requirements.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-600 uppercase">Special Requirements</h3>
                <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                  {job.requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Schedule & Location */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Schedule & Location</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-start space-x-3">
                <span className="text-lg">📅</span>
                <div>
                  <div className="font-semibold text-slate-800">Start Date</div>
                  <div className="text-slate-600 text-xs">
                    {job.startDate} {job.startTime ? `at ${job.startTime}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <span className="text-lg">📍</span>
                <div>
                  <div className="font-semibold text-slate-800">Location</div>
                  <div className="text-slate-600 text-xs">
                    {job.location.addressLine ? `${job.location.addressLine}, ` : ''}
                    {job.location.locality}, {job.location.city}, {job.location.state} — {job.location.pinCode}
                  </div>
                  <div className="text-blue-600 font-medium text-xs mt-0.5">
                    {job.distanceKm} km from your registered base
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <span className="text-lg">🏢</span>
                <div>
                  <div className="font-semibold text-slate-800">Employer Organization</div>
                  <div className="text-slate-600 text-xs">
                    {job.employer.businessName} ({job.employer.businessType || 'Direct Employer'})
                  </div>
                  <div className="text-slate-400 text-xs">
                    Total jobs posted: {job.employer.totalJobsPosted}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

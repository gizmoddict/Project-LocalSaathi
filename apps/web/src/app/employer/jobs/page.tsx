'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, Button } from '@localsaathi/ui';
import { employerApi } from '../../../lib/api-client';
import { JobResponse } from '@localsaathi/types';
import {
  Briefcase,
  PlusCircle,
  MapPin,
  Calendar,
  IndianRupee,
  Users,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  XCircle,
  Trash2,
  Edit3,
} from 'lucide-react';

const STATUS_FILTERS = ['ALL', 'DRAFT', 'PUBLISHED', 'PAUSED', 'FILLED', 'CANCELLED'];

export default function EmployerJobsListPage() {
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchJobs = () => {
    setLoading(true);
    setLoadError(null);
    const params = activeFilter === 'ALL' ? undefined : { status: activeFilter };
    employerApi
      .getJobs(params)
      .then((res) => {
        setJobs(res.jobs ?? []);
      })
      .catch((error: unknown) => {
        setJobs([]);
        setLoadError(
          error instanceof Error ? error.message : 'Could not load job postings.'
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchJobs();
  }, [activeFilter]);

  const handlePublish = async (jobId: string) => {
    try {
      await employerApi.publishJob(jobId);
      setActionMsg('Job published successfully!');
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const handlePause = async (jobId: string) => {
    try {
      await employerApi.pauseJob(jobId);
      setActionMsg('Job paused.');
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Pause failed');
    }
  };

  const handleResume = async (jobId: string) => {
    try {
      await employerApi.resumeJob(jobId);
      setActionMsg('Job resumed to PUBLISHED.');
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Resume failed');
    }
  };

  const handleClose = async (jobId: string) => {
    try {
      await employerApi.closeJob(jobId);
      setActionMsg('Job closed/cancelled.');
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Close failed');
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to permanently delete this draft job?')) return;
    try {
      await employerApi.deleteJob(jobId);
      setActionMsg('Draft job deleted.');
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'DRAFT':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'PAUSED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'FILLED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CANCELLED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link
            href="/employer"
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            My Job Postings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your draft, published, and archived hyperlocal job postings.
          </p>
        </div>
        <Link href="/employer/jobs/new">
          <Button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <PlusCircle className="w-4 h-4" />
            Post New Job
          </Button>
        </Link>
      </div>

      {actionMsg && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-blue-600 hover:text-blue-800 text-sm font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 border-b border-slate-200">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeFilter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Jobs List */}
      {loadError ? (
        <Card className="text-center py-12">
          <CardContent>
            <p role="alert" className="text-sm font-semibold text-red-700">
              Could not load job postings: {loadError}
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link href="/login?role=EMPLOYER">
                <Button variant="outline">Sign in as an employer</Button>
              </Link>
              <Button onClick={fetchJobs}>Try again</Button>
            </div>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="text-center py-12 text-slate-500">Loading job postings...</div>
      ) : jobs.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Briefcase className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-700">No jobs found in {activeFilter} status</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Get started by creating your first hyperlocal job opportunity.
            </p>
            <Link href="/employer/jobs/new">
              <Button className="bg-blue-600 text-white">Post a Job Now</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id} className="hover:border-slate-300 transition-shadow">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(
                          job.status
                        )}`}
                      >
                        {job.status}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {job.category}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-slate-900 hover:text-blue-600 transition-colors">
                      <Link href={`/employer/jobs/${job.id}`}>{job.title}</Link>
                    </h2>

                    <p className="text-sm text-slate-600 line-clamp-2 mt-1 mb-3">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
                      <span className="flex items-center gap-1 text-slate-900 font-semibold">
                        <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                        ₹{job.wageAmount} ({job.wageType})
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {job.workerCount} Worker{job.workerCount > 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Start: {job.startDate}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {job.location.locality}, {job.location.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex flex-wrap lg:flex-col items-end gap-2 border-t lg:border-t-0 pt-4 lg:pt-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/employer/jobs/${job.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          Details <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Link href={`/employer/jobs/${job.id}/applications`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Users className="w-3.5 h-3.5" /> Applicants
                        </Button>
                      </Link>
                    </div>

                    {job.status === 'DRAFT' && (
                      <div className="flex items-center gap-2">
                        <Link href={`/employer/jobs/${job.id}/edit`}>
                          <Button variant="outline" size="sm" className="flex items-center gap-1">
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          onClick={() => handlePublish(job.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Publish
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(job.id)}
                          className="text-red-600 hover:bg-red-50 border-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    {job.status === 'PUBLISHED' && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePause(job.id)}
                          className="flex items-center gap-1 text-amber-700 border-amber-200"
                        >
                          <PauseCircle className="w-3.5 h-3.5" /> Pause
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClose(job.id)}
                          className="flex items-center gap-1 text-red-600 border-red-200"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Close
                        </Button>
                      </div>
                    )}

                    {job.status === 'PAUSED' && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleResume(job.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                        >
                          <PlayCircle className="w-3.5 h-3.5" /> Resume
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClose(job.id)}
                          className="flex items-center gap-1 text-red-600 border-red-200"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Close
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

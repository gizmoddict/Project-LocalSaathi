'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@localsaathi/ui';
import { employerApi } from '../../../../lib/api-client';
import { JobResponse } from '@localsaathi/types';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  IndianRupee,
  Users,
  Wrench,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  XCircle,
  Trash2,
  Edit3,
  AlertCircle,
} from 'lucide-react';

export default function JobDetailsPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<JobResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const loadJob = () => {
    setLoading(true);
    employerApi
      .getJobById(jobId)
      .then((data) => setJob(data))
      .catch((err) => {
        setActionMsg({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load job',
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (jobId) loadJob();
  }, [jobId]);

  const handlePublish = async () => {
    try {
      await employerApi.publishJob(jobId);
      setActionMsg({ type: 'success', message: 'Job published successfully!' });
      loadJob();
    } catch (err) {
      setActionMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Publish failed',
      });
    }
  };

  const handlePause = async () => {
    try {
      await employerApi.pauseJob(jobId);
      setActionMsg({ type: 'success', message: 'Job paused.' });
      loadJob();
    } catch (err) {
      setActionMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Pause failed',
      });
    }
  };

  const handleResume = async () => {
    try {
      await employerApi.resumeJob(jobId);
      setActionMsg({ type: 'success', message: 'Job resumed to PUBLISHED.' });
      loadJob();
    } catch (err) {
      setActionMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Resume failed',
      });
    }
  };

  const handleFill = async () => {
    try {
      await employerApi.fillJob(jobId);
      setActionMsg({ type: 'success', message: 'Job marked as FILLED.' });
      loadJob();
    } catch (err) {
      setActionMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Fill failed',
      });
    }
  };

  const handleClose = async () => {
    try {
      await employerApi.closeJob(jobId);
      setActionMsg({ type: 'success', message: 'Job closed/cancelled.' });
      loadJob();
    } catch (err) {
      setActionMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Close failed',
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to permanently delete this draft job?')) return;
    try {
      await employerApi.deleteJob(jobId);
      router.push('/employer/jobs');
    } catch (err) {
      setActionMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500">
        Loading job posting details...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold text-slate-700">Job Not Found</p>
        <Link href="/employer/jobs" className="mt-4 inline-block text-blue-600 hover:underline">
          Return to All Jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/employer/jobs"
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to All Jobs
        </Link>
      </div>

      {actionMsg && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-2 border ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{actionMsg.message}</span>
        </div>
      )}

      {/* Main Job Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {job.status}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {job.category}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  Urgency: {job.urgency}
                </span>
              </div>
              <CardTitle className="text-2xl">{job.title}</CardTitle>
              <CardDescription className="mt-1">
                Posted on {new Date(job.createdAt).toLocaleDateString()}
                {job.publishedAt && ` • Published on ${new Date(job.publishedAt).toLocaleDateString()}`}
              </CardDescription>
            </div>

            {/* Lifecycle Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {job.status === 'DRAFT' && (
                <>
                  <Link href={`/employer/jobs/${job.id}/edit`}>
                    <Button variant="outline" size="sm" className="flex items-center gap-1">
                      <Edit3 className="w-4 h-4" /> Edit Draft
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    onClick={handlePublish}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Publish Now
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-600 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </>
              )}

              {job.status === 'PUBLISHED' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePause}
                    className="text-amber-700 border-amber-200 flex items-center gap-1"
                  >
                    <PauseCircle className="w-4 h-4" /> Pause
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleFill}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Filled
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClose}
                    className="text-red-600 border-red-200 flex items-center gap-1"
                  >
                    <XCircle className="w-4 h-4" /> Close
                  </Button>
                </>
              )}

              {job.status === 'PAUSED' && (
                <>
                  <Button
                    size="sm"
                    onClick={handleResume}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                  >
                    <PlayCircle className="w-4 h-4" /> Resume
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClose}
                    className="text-red-600 border-red-200 flex items-center gap-1"
                  >
                    <XCircle className="w-4 h-4" /> Close
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Applications Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Review Job Applicants</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  View worker applications, deterministic match scores, and shortlist or accept candidates.
                </p>
              </div>
            </div>
            <Link href={`/employer/jobs/${job.id}/applications`}>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 whitespace-nowrap">
                <Users className="w-4 h-4" /> View Applicants &rarr;
              </Button>
            </Link>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Description</h4>
            <p className="text-slate-800 whitespace-pre-line leading-relaxed">{job.description}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <p className="text-xs text-slate-500 font-medium">Compensation</p>
              <p className="text-lg font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <IndianRupee className="w-4 h-4 text-emerald-600" />
                ₹{job.wageAmount} / {job.wageType}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 font-medium">Workers Needed</p>
              <p className="text-lg font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Users className="w-4 h-4 text-blue-600" />
                {job.workerCount} ({job.durationDays} Day{job.durationDays > 1 ? 's' : ''})
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 font-medium">Start Schedule</p>
              <p className="text-lg font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Calendar className="w-4 h-4 text-purple-600" />
                {job.startDate} {job.startTime ? `@ ${job.startTime}` : ''}
              </p>
            </div>
          </div>

          {/* Required Skills */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" />
              Required Skills
            </h4>
            <div className="flex flex-wrap gap-2">
              {job.requiredSkills && job.requiredSkills.length > 0 ? (
                job.requiredSkills.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                  >
                    <span>{s.name}</span>
                    <span className="text-blue-500">({s.minExperienceYears}+ yrs)</span>
                    {s.isRequired && (
                      <span className="text-[10px] bg-blue-200 text-blue-900 px-1 rounded font-bold">
                        REQUIRED
                      </span>
                    )}
                  </span>
                ))
              ) : (
                <p className="text-xs text-slate-500">No skills attached yet.</p>
              )}
            </div>
          </div>

          {/* Location */}
          {job.location && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                Work Location
              </h4>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700">
                {job.location.addressLine && <p className="font-medium">{job.location.addressLine}</p>}
                <p>
                  {job.location.locality}, {job.location.city}, {job.location.state} -{' '}
                  <span className="font-semibold">{job.location.pinCode}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Coordinates: {job.location.latitude.toFixed(4)}, {job.location.longitude.toFixed(4)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

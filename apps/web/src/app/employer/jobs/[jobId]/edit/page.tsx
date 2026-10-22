'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@localsaathi/ui';
import { employerApi } from '../../../../../lib/api-client';
import {
  Briefcase,
  ArrowLeft,
  Save,
  AlertCircle,
} from 'lucide-react';

export default function EditJobPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params?.jobId as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Carpentry',
    wageType: 'DAILY',
    wageAmount: 1200,
    workerCount: 1,
    durationDays: 1,
    startDate: '',
    startTime: '09:00',
    urgency: 'STANDARD',
    skillName: '',
    minExperienceYears: 0,
    latitude: 12.9716,
    longitude: 77.5946,
    addressLine: '',
    locality: '',
    city: '',
    state: '',
    pinCode: '',
  });

  useEffect(() => {
    if (!jobId) return;
    employerApi
      .getJobById(jobId)
      .then((job) => {
        const primarySkill = job.requiredSkills?.[0];
        setForm({
          title: job.title || '',
          description: job.description || '',
          category: job.category || 'Carpentry',
          wageType: job.wageType || 'DAILY',
          wageAmount: job.wageAmount || 1200,
          workerCount: job.workerCount || 1,
          durationDays: job.durationDays || 1,
          startDate: job.startDate || '',
          startTime: job.startTime || '09:00',
          urgency: job.urgency || 'STANDARD',
          skillName: primarySkill?.name || 'General',
          minExperienceYears: primarySkill?.minExperienceYears || 0,
          latitude: job.location?.latitude || 12.9716,
          longitude: job.location?.longitude || 77.5946,
          addressLine: job.location?.addressLine || '',
          locality: job.location?.locality || '',
          city: job.location?.city || '',
          state: job.location?.state || '',
          pinCode: job.location?.pinCode || '',
        });
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch job');
      })
      .finally(() => setFetching(false));
  }, [jobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      wageType: form.wageType,
      wageAmount: Number(form.wageAmount),
      workerCount: Number(form.workerCount),
      durationDays: Number(form.durationDays),
      startDate: form.startDate,
      startTime: form.startTime,
      urgency: form.urgency,
      skills: [
        {
          name: form.skillName,
          isRequired: true,
          minExperienceYears: Number(form.minExperienceYears),
        },
      ],
      location: {
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        addressLine: form.addressLine,
        locality: form.locality,
        city: form.city,
        state: form.state,
        pinCode: form.pinCode,
      },
    };

    try {
      await employerApi.updateJob(jobId, payload);
      router.push(`/employer/jobs/${jobId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update job';
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500">
        Loading job for editing...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/employer/jobs/${jobId}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Cancel & Return
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Edit Job Post</CardTitle>
              <CardDescription>
                Modify job parameters, wages, skill requirements, or work location.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Job Title *
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Job Description *
              </label>
              <textarea
                rows={4}
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Wage Type *
                </label>
                <select
                  value={form.wageType}
                  onChange={(e) => setForm({ ...form, wageType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="DAILY">Daily Rate</option>
                  <option value="HOURLY">Hourly Rate</option>
                  <option value="FIXED">Fixed Lump Sum</option>
                  <option value="PIECE_RATE">Piece Rate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Wage Amount (₹) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.wageAmount}
                  onChange={(e) => setForm({ ...form, wageAmount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Locality
                </label>
                <input
                  type="text"
                  value={form.locality}
                  onChange={(e) => setForm({ ...form, locality: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={form.pinCode}
                  onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <Button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Update Job Post'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

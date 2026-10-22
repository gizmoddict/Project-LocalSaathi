'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@localsaathi/ui';
import { employerApi } from '../../../../lib/api-client';
import {
  Briefcase,
  ArrowLeft,
  Save,
  AlertCircle,
  MapPin,
  Wrench,
  Sparkles,
} from 'lucide-react';

export default function CreateJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Carpentry',
    wageType: 'DAILY',
    wageAmount: 1200,
    workerCount: 1,
    durationDays: 1,
    startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0]!,
    startTime: '09:00',
    urgency: 'STANDARD',
    skillName: 'General Carpentry',
    minExperienceYears: 1,
    latitude: 12.9716,
    longitude: 77.5946,
    addressLine: '12 1st Main Road',
    locality: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pinCode: '560038',
  });

  const handleSubmit = async (publishImmediately: boolean) => {
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
      const created = await employerApi.createJob(payload);
      if (publishImmediately) {
        await employerApi.publishJob(created.id);
      }
      router.push(`/employer/jobs/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create job';
      setErrorMsg(msg);
      setLoading(false);
    }
  };

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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Post a Hyperlocal Job</CardTitle>
              <CardDescription>
                Define job scope, skill requirements, compensation, and work location.
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

          <div className="space-y-6">
            {/* 1. Basic Information */}
            <div className="border-b border-slate-200 pb-6">
              <h3 className="text-base font-bold text-slate-900 mb-4">1. Job Scope & Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Job Title * (min 3 chars)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Master Carpenter for Modular Kitchen Fitting"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Job Description * (min 10 chars)
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe specific tasks, expectations, tools provided vs worker tools required..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Job Category *
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="Carpentry">Carpentry</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Plumbing">Plumbing</option>
                      <option value="Painting">Painting</option>
                      <option value="Masonry">Masonry</option>
                      <option value="Welding">Welding</option>
                      <option value="Logistics">Logistics & Warehousing</option>
                      <option value="Cleaning">Cleaning & Maintenance</option>
                      <option value="General">General Labor</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Urgency
                    </label>
                    <select
                      value={form.urgency}
                      onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="STANDARD">Standard (Next 2-5 days)</option>
                      <option value="IMMEDIATE">Immediate (Within 24 hours)</option>
                      <option value="FLEXIBLE">Flexible (Anytime)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Compensation & Schedule */}
            <div className="border-b border-slate-200 pb-6">
              <h3 className="text-base font-bold text-slate-900 mb-4">2. Compensation & Schedule</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Wage Structure *
                  </label>
                  <select
                    value={form.wageType}
                    onChange={(e) => setForm({ ...form, wageType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="DAILY">Daily Rate (per day)</option>
                    <option value="HOURLY">Hourly Rate (per hour)</option>
                    <option value="FIXED">Fixed Project Lump Sum</option>
                    <option value="PIECE_RATE">Piece Rate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Wage Amount (₹ INR) *
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

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Workers Needed
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.workerCount}
                    onChange={(e) => setForm({ ...form, workerCount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.durationDays}
                    onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 3. Skill Requirement */}
            <div className="border-b border-slate-200 pb-6">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-600" />
                3. Primary Skill Requirement
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Skill Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.skillName}
                    onChange={(e) => setForm({ ...form, skillName: e.target.value })}
                    placeholder="e.g. Modular Cabinet Assembly"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Min Experience (Years)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.minExperienceYears}
                    onChange={(e) => setForm({ ...form, minExperienceYears: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4. Location & PostGIS Coordinates */}
            <div className="pb-6">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                4. Job Location & Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Street Address / Landmark
                  </label>
                  <input
                    type="text"
                    value={form.addressLine}
                    onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                    placeholder="House/Plot no., building, street"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Locality *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.locality}
                      onChange={(e) => setForm({ ...form, locality: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      PIN Code *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={form.pinCode}
                      onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Latitude (WGS84)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Longitude (WGS84)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => handleSubmit(false)}
                className="w-full sm:w-auto flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save as Draft'}
              </Button>

              <Button
                type="button"
                disabled={loading}
                onClick={() => handleSubmit(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Sparkles className="w-4 h-4" />
                {loading ? 'Creating...' : 'Create & Publish Job'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

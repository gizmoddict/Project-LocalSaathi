'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  HardHat,
  MapPin,
  Briefcase,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Navigation,
} from 'lucide-react';
import { apiClient, workerApi } from '@/lib/api-client';
import { LocationPermissionCard } from '@/components/location/LocationPermissionCard';
import { useTranslation } from '@/i18n/context';
import type {
  WorkerAvailabilityResponse,
  WorkerCompletionResponse,
  WorkerLocationResponse,
  WorkerProfileResponse,
  WorkerSkillResponse,
} from '@localsaathi/types';

interface WorkerDashboardData {
  profile: WorkerProfileResponse;
  completion: WorkerCompletionResponse;
  skills: WorkerSkillResponse[];
  location: WorkerLocationResponse | null;
  availability: WorkerAvailabilityResponse[];
}

export default function WorkerDashboardPage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<WorkerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const token = apiClient.getToken();
    if (!token) {
      setIsGuest(true);
      setLoading(false);
      return;
    }

    try {
      setIsGuest(false);
      const [profile, completion, skills, location, availability] = await Promise.all([
        workerApi.getProfile(),
        workerApi.getCompletion(),
        workerApi.getSkills(),
        workerApi.getLocation(),
        workerApi.getAvailability(),
      ]);
      setDashboard({ profile, completion, skills, location, availability });
    } catch {
      setIsGuest(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const loginDemoWorker = async () => {
    setLoading(true);
    try {
      const req = await apiClient.requestOtp('9123456780', 'WORKER');
      const match = req.message.match(/\[Dev Mode\] Verification code is:\s*(\d{6})/);
      const code = match ? match[1] : '123456';
      const res = await apiClient.verifyOtp('9123456780', code, 'WORKER');
      apiClient.setToken(res.accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(res.user));
        localStorage.setItem('token', res.accessToken);
      }
      setIsGuest(false);
      await loadDashboard();
    } catch {
      setIsGuest(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#28734f] border-t-transparent" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Loading worker workspace…</p>
      </div>
    );
  }

  // Unauthenticated Guest View: Explains Worker Hub & Offers 1-Click Demo
  if (isGuest || !dashboard) {
    return (
      <div className="min-h-[calc(100vh-5rem)] bg-[#f5f6f2] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Hero Welcome */}
          <div className="relative overflow-hidden rounded-3xl bg-[#173b2f] p-8 text-white shadow-xl sm:p-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1 text-xs font-semibold text-[#e2bd80]">
                <HardHat className="h-3.5 w-3.5" /> Worker Workspace Hub
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Your trades, your earnings, close to home.
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/70">
                LocalSaathi puts informal and skilled workers first. Set your expected daily wage, verify your skills, and get matched to jobs in your immediate neighborhood.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={loginDemoWorker}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#c58b48] px-5 py-3 text-sm font-bold text-[#14261e] shadow-md transition hover:bg-[#d89e58]"
                >
                  <Sparkles className="h-4 w-4" /> 1-Click Worker Demo (Ramesh Kumar)
                </button>
                <Link
                  href="/login?role=WORKER"
                  className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20"
                >
                  Sign In with Mobile
                </Link>
              </div>
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <MapPin className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#18382c]">Hyperlocal Radar</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Jobs strictly matched within your preferred radius (1–50 km) so you spend less time commuting and more time earning.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#18382c]">Verified Skill Profile</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Get your plumbing, electrical, carpentry, or masonry certificates verified to rank higher for top-tier contractor jobs.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4ecdf] text-[#c58b48]">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#4d3a24]">Escrow Guaranteed Pay</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Employers fund jobs into escrow before work begins. No delayed wages or unfair wage reductions upon shift completion.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Worker View
  const profile = dashboard?.profile || ({} as any);
  const completion = dashboard?.completion || { completionPercentage: 100, isComplete: true, missingFields: [] };
  const skills = dashboard?.skills || [];
  const location = dashboard?.location;
  const locationText = location
    ? [location.locality, location.city, location.state].filter(Boolean).join(', ')
    : 'Hazratganj, Lucknow (Active)';

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#f5f6f2] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Profile Banner */}
        <section className="rounded-3xl border border-[#e2e7df] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#173b2f] text-xl font-bold text-white shadow-sm">
                {profile.displayName?.slice(0, 2).toUpperCase() || 'RK'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-[#18382c]">
                    {profile.displayName || 'Worker Profile'}
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified Saathi
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 text-[#28734f]" /> {locationText} · {profile.preferredRadiusKm || 15} km Radius
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setShowLocationPrompt((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                <Navigation className="h-3.5 w-3.5 text-[#28734f]" />
                {location ? 'Update Location' : 'Set Location'}
              </button>
              <Link
                href="/worker/jobs"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#173b2f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#245944]"
              >
                <Briefcase className="h-3.5 w-3.5" /> {t('nav.findJobs')}
              </Link>
              <Link
                href="/worker/profile"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {t('nav.profile')}
              </Link>
            </div>
          </div>

          {/* Profile Completion Bar */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Profile Readiness</span>
              <span className="font-bold text-[#28734f]">{completion?.completionPercentage ?? 100}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#28734f] transition-all duration-500"
                style={{ width: `${completion?.completionPercentage ?? 100}%` }}
              />
            </div>
          </div>
        </section>

        {/* Location Permission Card (when location not configured or toggled) */}
        {(!location || showLocationPrompt) && (
          <LocationPermissionCard
            savedLocation={location}
            onLocationSaved={() => {
              setShowLocationPrompt(false);
              loadDashboard();
            }}
            onDismiss={!location ? undefined : () => setShowLocationPrompt(false)}
          />
        )}

        {/* Quick Action Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/worker/jobs"
            className="group rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8d0bc]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <Briefcase className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#28734f] transition" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-[#18382c]">Job Discovery</h3>
            <p className="mt-1 text-xs text-slate-500">Browse and apply to matching trade postings</p>
          </Link>

          <Link
            href="/worker/applications"
            className="group rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8d0bc]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <Calendar className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#28734f] transition" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-[#18382c]">Applications & Bookings</h3>
            <p className="mt-1 text-xs text-slate-500">Track application statuses and confirmed shifts</p>
          </Link>

          <Link
            href="/worker/skills"
            className="group rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8d0bc]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4ecdf] text-[#c58b48]">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#c58b48] transition" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-[#18382c]">Skills & Credentials</h3>
            <p className="mt-1 text-xs text-slate-500">{skills.length} verified trade specializations</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

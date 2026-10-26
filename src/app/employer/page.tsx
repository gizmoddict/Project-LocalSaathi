'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  PlusCircle,
  Briefcase,
  Users,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { apiClient, employerApi } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';
import type { EmployerDashboardResponse } from '@localsaathi/types';

export default function EmployerDashboardPage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<EmployerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

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
      setDashboard(await employerApi.getEmployerDashboard());
    } catch {
      setIsGuest(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const loginDemoEmployer = async () => {
    setLoading(true);
    try {
      const req = await apiClient.requestOtp('9876543210', 'EMPLOYER');
      const match = req.message.match(/\[Dev Mode\] Verification code is:\s*(\d{6})/);
      const code = match ? match[1] : '123456';
      const res = await apiClient.verifyOtp('9876543210', code, 'EMPLOYER');
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
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#c58b48] border-t-transparent" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Loading employer workspace…</p>
      </div>
    );
  }

  // Unauthenticated Guest View: Explains Employer Hub & Offers 1-Click Demo
  if (isGuest || !dashboard) {
    return (
      <div className="min-h-[calc(100vh-5rem)] bg-[#f5f6f2] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Hero Welcome */}
          <div className="relative overflow-hidden rounded-3xl bg-[#173b2f] p-8 text-white shadow-xl sm:p-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1 text-xs font-semibold text-[#e2bd80]">
                <Building2 className="h-3.5 w-3.5" /> Employer & Contractor Hub
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Hire skilled, verified local talent in minutes.
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Post jobs with specific trade requirements, discover verified electricians, plumbers, and carpenters nearby, and manage shifts with automated escrow.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={loginDemoEmployer}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#c58b48] px-5 py-3 text-sm font-bold text-[#14261e] shadow-md transition hover:bg-[#d89e58]"
                >
                  <Sparkles className="h-4 w-4" /> 1-Click Employer Demo (Rajesh Sharma)
                </button>
                <Link
                  href="/login?role=EMPLOYER"
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
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4ecdf] text-[#c58b48]">
                <PlusCircle className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#18382c]">Post in Under 2 Minutes</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Set daily or hourly rates, define required tool sets, and broadcast your listing instantly to nearby active tradespeople.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#18382c]">Verified Pros Only</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Review authenticated worker ratings, background verifications, and verified trade skill badges before confirming bookings.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#18382c]">Zero-Friction Invoicing</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Automated attendance logging, milestone-based escrow release, and unified tax invoices for commercial contractor operations.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Employer View
  const profile = dashboard?.profile || ({} as any);
  const completion = dashboard?.completion || { completionPercentage: 100, isComplete: true, missingFields: [] };
  const location = [profile?.locality, profile?.city, profile?.state].filter(Boolean).join(', ') || 'Hazratganj, Lucknow';

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#f5f6f2] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Business Profile Banner */}
        <section className="rounded-3xl border border-[#e2e7df] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#c58b48] text-xl font-bold text-white shadow-sm">
                {profile.businessName?.slice(0, 2).toUpperCase() || 'SH'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-[#18382c]">
                    {profile.businessName || 'Your Business'}
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified Business
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 text-[#c58b48]" /> {location} · {profile.businessType || 'General Contractor'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/employer/jobs/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#c58b48] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#d89e58]"
              >
                <PlusCircle className="h-3.5 w-3.5" /> {t('employer.postNewJob')}
              </Link>
              <Link
                href="/employer/profile"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {t('employer.businessProfile')}
              </Link>
            </div>
          </div>

          {/* Profile Completion Bar */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>{t('employer.businessProfile')}</span>
              <span className="font-bold text-[#c58b48]">{completion?.completionPercentage ?? 100}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#c58b48] transition-all duration-500"
                style={{ width: `${completion?.completionPercentage ?? 100}%` }}
              />
            </div>
          </div>
        </section>

        {/* Quick Action Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/employer/jobs/new"
            className="group rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#bad0bd]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4ecdf] text-[#c58b48]">
                <PlusCircle className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#c58b48] transition rtl-flip" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-[#18382c]">{t('employer.postNewJob')}</h3>
            <p className="mt-1 text-xs text-slate-500">Create a new trade requirement in under 2 minutes</p>
          </Link>

          <Link
            href="/employer/jobs"
            className="group rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#bad0bd]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <Briefcase className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#28734f] transition rtl-flip" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-[#18382c]">{t('employer.manageListings')}</h3>
            <p className="mt-1 text-xs text-slate-500">Manage posted jobs and review worker applicants</p>
          </Link>

          <Link
            href="/employer/bookings"
            className="group rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#bad0bd]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                <Users className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#28734f] transition rtl-flip" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-[#18382c]">{t('employer.hiredSaathis')}</h3>
            <p className="mt-1 text-xs text-slate-500">Track current contracts, shifts, and escrow releases</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

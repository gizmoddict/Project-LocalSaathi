'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  HardHat,
  MapPin,
  Search,
  Sparkles,
  Wrench,
  ShieldCheck,
  Clock,
  Star,
  Zap,
} from 'lucide-react';
import { useTranslation } from '@/i18n/context';

const categories = [
  'Plumbing',
  'Electrical',
  'Construction',
  'Carpentry',
  'Housekeeping',
  'Logistics',
  'Painting',
];

export default function HomePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [category, setCategory] = useState('');
  const [activeTab, setActiveTab] = useState<'worker' | 'employer'>('worker');

  function searchJobs(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    router.push(`/worker/jobs${params.size ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="page-enter overflow-hidden">
      {/* Hero Section */}
      <section className="relative mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-8 sm:pt-10 lg:px-12 lg:pb-20">
        <div className="relative overflow-hidden rounded-[32px] bg-[#173b2f] px-6 py-10 text-white shadow-[0_28px_80px_rgba(23,59,47,0.18)] sm:px-10 sm:py-16 lg:px-16 lg:py-20">
          {/* Subtle Ambient Background Gradients */}
          <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-12 -top-28 h-[360px] w-[360px] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute bottom-[-160px] right-[10%] h-[360px] w-[360px] rounded-full bg-[#d0a76c]/15 blur-3xl" />
          <div className="pointer-events-none absolute left-[-80px] top-1/2 h-[260px] w-[260px] rounded-full bg-[#28734f]/30 blur-3xl" />

          <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            {/* Left Column: Headline & Search */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#dce9dd] backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-[#e6bd7a]" />
                {t('home.platformBadge')}
              </div>

              <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-6xl lg:text-[4.2rem]">
                {t('home.heroTitle')}
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
                {t('home.heroSubtitle')}
              </p>

              {/* Job Finder Form */}
              <form
                onSubmit={searchJobs}
                className="mt-8 max-w-2xl rounded-2xl bg-white p-2.5 shadow-[0_16px_44px_rgba(0,0,0,0.22)] sm:flex sm:items-center"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {t('home.searchCategoryLabel')}
                    </span>
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="mt-0.5 w-full border-0 bg-transparent p-0 text-sm font-semibold text-slate-800 outline-none focus:ring-0"
                      aria-label="Choose a job category"
                    >
                      <option value="">{t('home.allTrades')}</option>
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 sm:hidden" />
                </label>

                <div className="mx-2 hidden h-9 border-l border-slate-200 sm:block" />

                <div className="hidden min-w-[150px] flex-1 items-center gap-3 px-3 sm:flex">
                  <MapPin className="h-5 w-5 shrink-0 text-[#28734f]" />
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {t('worker.locationStatus')}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-800 truncate">
                      Hazratganj, Lucknow (15 km)
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c58b48] px-6 py-3.5 text-sm font-bold text-[#14261e] shadow-md transition duration-200 hover:bg-[#d89e58] hover:shadow-lg active:scale-[0.98] sm:mt-0 sm:w-auto"
                >
                  <Search className="h-4 w-4" />
                  {t('nav.findWork')}
                </button>
              </form>

              {/* Trade Pills */}
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-white/60">
                <span className="mr-1 font-semibold text-white/80">Popular:</span>
                {categories.slice(0, 5).map((item, index) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCategory(item);
                        router.push(`/worker/jobs?category=${encodeURIComponent(item)}`);
                      }}
                      className="transition hover:text-[#e2bd80] underline-offset-4 hover:underline"
                    >
                      {item}
                    </button>
                    {index < 4 && <span className="text-white/20">·</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Right Column: Responsive Interactive Preview Card */}
            <div className="relative mx-auto w-full max-w-[460px]">
              <div className="absolute inset-4 rounded-[36px] bg-[#e6bd7a]/15 blur-2xl" />

              <div className="relative rounded-[28px] border border-white/20 bg-[#f7f6f0] p-5 text-slate-800 shadow-[0_24px_64px_rgba(0,0,0,0.25)]">
                {/* Header Switcher */}
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-1.5 rounded-full bg-white/80 p-1 border border-slate-200 text-xs font-bold text-slate-600">
                    <button
                      type="button"
                      onClick={() => setActiveTab('worker')}
                      className={`rounded-full px-3 py-1 transition ${
                        activeTab === 'worker' ? 'bg-[#173b2f] text-white shadow-xs' : 'hover:text-slate-900'
                      }`}
                    >
                      {t('home.forWorkersTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('employer')}
                      className={`rounded-full px-3 py-1 transition ${
                        activeTab === 'employer' ? 'bg-[#c58b48] text-white shadow-xs' : 'hover:text-slate-900'
                      }`}
                    >
                      {t('home.forEmployersTab')}
                    </button>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#28734f]">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                    Live radar
                  </span>
                </div>

                {/* Content according to tab */}
                {activeTab === 'worker' ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
                            <Wrench className="h-5 w-5" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#28734f]">
                              98% Match Score · 1.2 km away
                            </span>
                            <h3 className="font-bold text-[#18382c] text-sm">
                              Residential Pipe Replacement
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">Sharma Home Renovations · Hazratganj</p>
                          </div>
                        </div>
                        <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                      </div>

                      <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-extrabold text-[#18382c]">₹900</span>
                          <span className="text-[11px] text-slate-500">/ day · Immediate</span>
                        </div>
                        <Link
                          href="/worker/jobs"
                          className="rounded-lg bg-[#173b2f] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#245944]"
                        >
                          View details
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-[#eaf3ea] p-3.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#28734f]">
                          <Zap className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#18382c]">Direct Escrow</p>
                        <p className="text-[11px] text-slate-600">Guaranteed daily pay</p>
                      </div>

                      <div className="rounded-2xl bg-[#f5ede1] p-3.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#c58b48]">
                          <Clock className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#4d3a24]">Zero Travel Hassle</p>
                        <p className="text-[11px] text-slate-600">Under 15 min commute</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f4ecdf] text-[#c58b48]">
                            <HardHat className="h-5 w-5" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#c58b48]">
                              Verified Pro · 7 yrs experience
                            </span>
                            <h3 className="font-bold text-[#18382c] text-sm">
                              Ramesh Kumar (Plumbing Specialist)
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">Hazratganj, Lucknow · 500m away</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-bold text-amber-600">
                          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> 4.9
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-xs font-medium text-slate-600">Available Today (08:00 - 17:00)</span>
                        <Link
                          href="/employer"
                          className="rounded-lg bg-[#c58b48] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#d89e58]"
                        >
                          Hire Pro
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-[#eaf3ea] p-3.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#28734f]">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#18382c]">Identity Verified</p>
                        <p className="text-[11px] text-slate-600">Background checked</p>
                      </div>

                      <div className="rounded-2xl bg-[#f5ede1] p-3.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#c58b48]">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#4d3a24]">Post in 60s</p>
                        <p className="text-[11px] text-slate-600">Instant candidates</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Stats Strip */}
      <section className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm md:grid-cols-4">
          <div className="text-center sm:text-left sm:pl-4">
            <p className="text-2xl font-extrabold text-[#18382c] sm:text-3xl">500+</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Verified Local Saathis</p>
          </div>
          <div className="text-center sm:text-left sm:pl-4 border-l border-slate-100">
            <p className="text-2xl font-extrabold text-[#28734f] sm:text-3xl">₹850</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Average Daily Wage</p>
          </div>
          <div className="text-center sm:text-left sm:pl-4 border-l border-slate-100">
            <p className="text-2xl font-extrabold text-[#c58b48] sm:text-3xl">&lt; 15 min</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Hyperlocal Commute</p>
          </div>
          <div className="text-center sm:text-left sm:pl-4 border-l border-slate-100">
            <p className="text-2xl font-extrabold text-[#18382c] sm:text-3xl">100%</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Escrow Protected Pay</p>
          </div>
        </div>
      </section>

      {/* Value Pillars Section */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#28734f]">
            One neighbourhood at a time
          </span>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18382c] sm:text-4xl">
            Local work should feel simple.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Less searching. Clearer expectations. A direct connection between people who need work done and people ready to do it.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <ValueCard
            icon={<MapPin className="h-5 w-5" />}
            title="Close to home"
            text="PostGIS spatial radius matching filters work within walking or short transit distance of your home."
            badge="Radar Matching"
          />
          <ValueCard
            icon={<BadgeCheck className="h-5 w-5" />}
            title="Built on trust"
            text="Verified phone OTPs, verified trade skill profiles, and authentic post-job employer ratings."
            badge="Verified Identity"
          />
          <ValueCard
            icon={<Zap className="h-5 w-5" />}
            title="Fair & secure wages"
            text="Clear daily and hourly wages agreed before work starts, with milestone and escrow protections."
            badge="Prompt Pay"
          />
        </div>

        {/* Audience Split Cards */}
        <div className="mt-20 flex flex-col justify-between gap-5 border-t border-[#dfe5dc] pt-10 sm:flex-row sm:items-end">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#28734f]">
              Choose your path
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#18382c] sm:text-3xl">
              What brings you here today?
            </h2>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#28734f] transition hover:gap-3"
          >
            Create an account in 60 seconds <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <AudienceCard
            href="/login?role=WORKER"
            icon={<HardHat className="h-6 w-6" />}
            eyebrow="FOR WORKERS & TECHNICIANS"
            title="Find work that fits your skills."
            text="Discover local daily/project jobs, get matched based on your trade experience, track your applications, and receive prompt direct payments."
            action="Enter Worker Workspace"
            tone="green"
            features={[
              'Personalized PostGIS job matching',
              'Set your daily & hourly expected wages',
              'Direct chat with employers',
              'Fast earnings settlement',
            ]}
          />
          <AudienceCard
            href="/login?role=EMPLOYER"
            icon={<Building2 className="h-6 w-6" />}
            eyebrow="FOR EMPLOYERS & CONTRACTORS"
            title="Find the right skilled people nearby."
            text="Post a job, share the important requirements, review verified applicant profiles, and manage hiring, contracts, and attendance in one dashboard."
            action="Enter Employer Workspace"
            tone="sand"
            features={[
              'Post verified jobs in under 2 minutes',
              'Match with expert plumbers, electricians & builders',
              'Integrated bookings & escrow system',
              'Review and rehire favorite Saathis',
            ]}
          />
        </div>

        {/* Quick Demo Access Bar */}
        <div className="mt-14 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50 p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-bold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Interactive Platform Evaluation
              </span>
              <h3 className="mt-2 text-xl font-bold text-[#18382c]">
                Want to test all roles immediately?
              </h3>
              <p className="mt-1 text-sm text-slate-600 max-w-xl">
                Experience LocalSaathi with preloaded fixtures. Choose any role below to explore live job feeds, bookings, messaging, and system governance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login?role=WORKER"
                className="rounded-xl bg-[#173b2f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#245944]"
              >
                Worker Demo
              </Link>
              <Link
                href="/login?role=EMPLOYER"
                className="rounded-xl bg-[#c58b48] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#d89e58]"
              >
                Employer Demo
              </Link>
              <Link
                href="/admin"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Admin Ops Console
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ValueCard({
  icon,
  title,
  text,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  badge: string;
}) {
  return (
    <div className="group rounded-2xl border border-[#e1e7df] bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-[#b8d0bc] hover:shadow-[0_12px_32px_rgba(35,75,48,0.08)]">
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f] transition group-hover:bg-[#173b2f] group-hover:text-white">
          {icon}
        </span>
        <span className="rounded-full bg-[#f4f7f4] px-2.5 py-1 text-[10px] font-bold text-slate-600">
          {badge}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-bold text-[#18382c]">{title}</h3>
      <p className="mt-2 text-xs leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function AudienceCard({
  href,
  icon,
  eyebrow,
  title,
  text,
  action,
  tone,
  features,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  action: string;
  tone: 'green' | 'sand';
  features: string[];
}) {
  const iconColors =
    tone === 'green'
      ? 'bg-[#edf4ed] text-[#28734f] group-hover:bg-[#173b2f] group-hover:text-white'
      : 'bg-[#f4ecdf] text-[#c58b48] group-hover:bg-[#c58b48] group-hover:text-white';

  const btnBg =
    tone === 'green'
      ? 'bg-[#173b2f] hover:bg-[#245944] text-white'
      : 'bg-[#c58b48] hover:bg-[#d89e58] text-white';

  return (
    <div className="group flex flex-col justify-between rounded-3xl border border-[#e1e7df] bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[#bfd0bf] hover:shadow-[0_18px_44px_rgba(35,75,48,0.08)] sm:p-8">
      <div>
        <div className="flex items-start justify-between gap-5">
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl transition duration-200 ${iconColors}`}>
            {icon}
          </span>
          <ArrowUpRight className="h-5 w-5 text-slate-300 transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[#28734f]" />
        </div>

        <p className="mt-6 text-[11px] font-bold tracking-[0.16em] text-slate-400">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#18382c]">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">{text}</p>

        {/* Feature bullets */}
        <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5 text-xs text-slate-600">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                ✓
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 pt-4">
        <Link
          href={href}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold shadow-sm transition ${btnBg}`}
        >
          {action} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

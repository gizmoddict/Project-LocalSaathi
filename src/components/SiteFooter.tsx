'use client';

import Link from 'next/link';
import { ShieldCheck, Heart, Zap } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export default function SiteFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-[#e2e7df] bg-white pt-16 pb-12 text-slate-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#173b2f] text-sm font-black text-white shadow-sm">
                LS
              </div>
              <span className="text-xl font-extrabold tracking-tight text-[#18382c]">
                Local<span className="text-[#28734f]">Saathi</span>
              </span>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              {t('footer.brandDescription')}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf4ed] px-3 py-1 text-xs font-bold text-[#28734f]">
                <ShieldCheck className="h-3.5 w-3.5" /> {t('footer.postgisEngine')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f4ecdf] px-3 py-1 text-xs font-bold text-[#9b713e]">
                <Zap className="h-3.5 w-3.5" /> {t('footer.escrowProtected')}
              </span>
            </div>
          </div>

          {/* Workers */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18382c]">{t('footer.forWorkers')}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/worker/jobs" className="transition hover:text-[#28734f]">{t('nav.findWork')}</Link></li>
              <li><Link href="/worker/skills" className="transition hover:text-[#28734f]">{t('worker.mySkills')}</Link></li>
              <li><Link href="/worker/availability" className="transition hover:text-[#28734f]">{t('worker.availability')}</Link></li>
              <li><Link href="/worker/applications" className="transition hover:text-[#28734f]">{t('worker.myApplications')}</Link></li>
              <li><Link href="/worker/bookings" className="transition hover:text-[#28734f]">{t('worker.activeBookings')}</Link></li>
            </ul>
          </div>

          {/* Employers */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18382c]">{t('footer.forEmployers')}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/employer/jobs/new" className="transition hover:text-[#28734f]">{t('employer.postNewJob')}</Link></li>
              <li><Link href="/employer/jobs" className="transition hover:text-[#28734f]">{t('employer.manageListings')}</Link></li>
              <li><Link href="/employer/bookings" className="transition hover:text-[#28734f]">{t('employer.hiredSaathis')}</Link></li>
              <li><Link href="/employer/profile" className="transition hover:text-[#28734f]">{t('employer.businessProfile')}</Link></li>
              <li><Link href="/payments" className="transition hover:text-[#28734f]">{t('footer.escrowProtected')}</Link></li>
            </ul>
          </div>

          {/* Governance & Ops */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18382c]">{t('footer.operations')}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/admin" className="transition hover:text-[#28734f]">{t('nav.adminOps')}</Link></li>
              <li><Link href="/admin/system-health" className="transition hover:text-[#28734f]">System Health</Link></li>
              <li><Link href="/admin/moderation" className="transition hover:text-[#28734f]">Trust & Moderation</Link></li>
              <li><Link href="/admin/audit-logs" className="transition hover:text-[#28734f]">Audit Trail</Link></li>
              <li><Link href="/admin/analytics" className="transition hover:text-[#28734f]">Platform Analytics</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 pt-8 sm:flex-row text-xs text-slate-500">
          <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {t('footer.allSystemsOperational')}
            </span>
            <span className="flex items-center gap-1">
              {t('footer.builtWithHeart')} <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, BriefcaseBusiness, Building2, Menu, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';

export default function SiteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const [signedIn, setSignedIn] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(apiClient.getToken()));
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    setSignOutError('');
    try {
      await apiClient.logout();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not end the server session.');
    } finally {
      apiClient.setToken(null);
      setSignedIn(false);
      router.push('/');
    }
  }

  return (
    <div className="relative">
      <nav aria-label="Main navigation" className="hidden items-center gap-1 text-[13px] font-semibold text-slate-600 md:flex">
        <NavLink href="/worker/jobs" active={pathname.startsWith('/worker/jobs')}>{t('nav.findWork')}</NavLink>
        <NavLink href="/worker" active={pathname === '/worker'}>{t('nav.workerSpace')}</NavLink>
        <NavLink href="/employer" active={pathname === '/employer'}>{t('nav.forEmployers')}</NavLink>
        <LanguageSelector variant="header" className="ml-1" />
        {signedIn ? (
          <button type="button" onClick={signOut} className="ml-2 rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-slate-300 hover:bg-white">
            {t('nav.signOut')}
          </button>
        ) : (
          <Link href="/login" className="ml-2 inline-flex items-center gap-2 rounded-full bg-[#173b2f] px-5 py-2.5 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#245944]">
            {t('nav.getStarted')} <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
          </Link>
        )}
      </nav>
      <button
        type="button"
        aria-label={mobileOpen ? t('nav.closeNavigation') : t('nav.openNavigation')}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 md:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {mobileOpen && (
        <nav aria-label="Mobile navigation" className="absolute right-0 top-14 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl md:hidden">
          <MobileLink href="/worker/jobs" icon={<BriefcaseBusiness className="h-4 w-4" />}>{t('nav.findWork')}</MobileLink>
          <MobileLink href="/worker" icon={<BriefcaseBusiness className="h-4 w-4" />}>{t('worker.dashboard')}</MobileLink>
          <MobileLink href="/employer" icon={<Building2 className="h-4 w-4" />}>{t('employer.dashboard')}</MobileLink>
          <LanguageSelector variant="mobile" />
          {signedIn ? (
            <button onClick={signOut} className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50">{t('nav.signOut')}</button>
          ) : (
            <Link href="/login" className="mt-1 block rounded-xl bg-[#173b2f] px-3 py-2.5 text-sm font-semibold text-white">{t('nav.signInOrJoin')}</Link>
          )}
        </nav>
      )}
      {signOutError && <p role="status" className="absolute right-4 mt-2 max-w-sm text-xs text-red-700">{signOutError}</p>}
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full px-4 py-2.5 transition ${active ? 'bg-[#edf3ee] text-[#245944]' : 'hover:bg-white hover:text-[#245944]'}`}
    >
      {children}
    </Link>
  );
}

function MobileLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      <span className="text-emerald-700">{icon}</span>
      {children}
    </Link>
  );
}

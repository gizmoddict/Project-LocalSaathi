'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Briefcase,
  Building2,
  HardHat,
  LogOut,
  Menu,
  MessageSquare,
  Bell,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';

interface CurrentUser {
  id: string;
  role: 'WORKER' | 'EMPLOYER' | 'ADMIN' | 'SUPPORT' | 'MODERATOR';
  phone?: string;
  displayName?: string;
}

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);

    try {
      const token = apiClient.getToken();
      if (!token) {
        setCurrentUser(null);
        return;
      }
      const rawUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (rawUser) {
        setCurrentUser(JSON.parse(rawUser));
      } else {
        // Fallback default user object if token exists
        setCurrentUser({ id: 'active', role: 'WORKER' });
      }
    } catch {
      setCurrentUser(null);
    }
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      await apiClient.logout();
    } catch {
      // Ignored
    } finally {
      apiClient.setToken(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      }
      setCurrentUser(null);
      router.push('/');
    }
  };

  const isWorker = currentUser?.role === 'WORKER';
  const isEmployer = currentUser?.role === 'EMPLOYER';

  return (
    <header className="sticky top-0 z-50 border-b border-[#e5ebe3] bg-white/90 shadow-[0_4px_24px_rgba(23,59,47,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#173b2f] text-base font-black tracking-tight text-white shadow-[0_6px_16px_rgba(23,59,47,0.25)] transition duration-200 group-hover:scale-105 group-hover:bg-[#1f4e3e]">
            LS
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-[#18382c]">
                Local<span className="text-[#28734f]">Saathi</span>
              </span>
              <span className="hidden rounded-full bg-[#edf4ed] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#28734f] sm:inline-block">
                Hyperlocal
              </span>
            </div>
            <span className="hidden text-[10px] font-semibold tracking-[0.14em] text-slate-500 sm:block">
              {t('common.subTagline')}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Main navigation" className="hidden items-center gap-1.5 text-[13px] font-semibold text-slate-600 md:flex">
          <Link
            href="/worker/jobs"
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 transition ${
              pathname.startsWith('/worker/jobs')
                ? 'bg-[#edf4ed] text-[#18382c]'
                : 'hover:bg-slate-100/80 hover:text-[#18382c]'
            }`}
          >
            <Briefcase className="h-4 w-4 text-[#28734f]" />
            {t('nav.findWork')}
            <span className="ml-1 rounded-full bg-[#28734f] px-1.5 py-0.2 text-[10px] font-bold text-white">{t('common.live')}</span>
          </Link>

          <Link
            href="/worker"
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 transition ${
              pathname === '/worker'
                ? 'bg-[#edf4ed] text-[#18382c]'
                : 'hover:bg-slate-100/80 hover:text-[#18382c]'
            }`}
          >
            <HardHat className="h-4 w-4 text-[#28734f]" />
            {t('nav.workerSpace')}
          </Link>

          <Link
            href="/employer"
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 transition ${
              pathname.startsWith('/employer')
                ? 'bg-[#edf4ed] text-[#18382c]'
                : 'hover:bg-slate-100/80 hover:text-[#18382c]'
            }`}
          >
            <Building2 className="h-4 w-4 text-[#c58b48]" />
            {t('nav.forEmployers')}
          </Link>

          {currentUser && (
            <>
              <Link
                href="/messages"
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 transition ${
                  pathname.startsWith('/messages')
                    ? 'bg-[#edf4ed] text-[#18382c]'
                    : 'hover:bg-slate-100/80 hover:text-[#18382c]'
                }`}
                title={t('nav.messages')}
              >
                <MessageSquare className="h-4 w-4 text-slate-500" />
                <span>{t('nav.messages')}</span>
              </Link>

              <Link
                href="/notifications"
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 transition ${
                  pathname.startsWith('/notifications')
                    ? 'bg-[#edf4ed] text-[#18382c]'
                    : 'hover:bg-slate-100/80 hover:text-[#18382c]'
                }`}
                title={t('nav.alerts')}
              >
                <Bell className="h-4 w-4 text-slate-500" />
                <span>{t('nav.alerts')}</span>
              </Link>
            </>
          )}

          <Link
            href="/admin"
            className="ml-1 flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-[#173b2f] hover:bg-white hover:text-[#173b2f]"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-[#28734f]" />
            {t('nav.adminOps')}
          </Link>

          {/* Multilingual Selector */}
          <div className="ml-1">
            <LanguageSelector variant="header" />
          </div>

          {/* User / Auth Action */}
          {currentUser ? (
            <div className="ml-2 flex items-center gap-2 pl-2 border-l border-slate-200">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                isWorker ? 'bg-emerald-100 text-emerald-800' :
                isEmployer ? 'bg-amber-100 text-amber-800' :
                'bg-slate-800 text-slate-100'
              }`}>
                {currentUser.role}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                title={t('nav.signOut')}
              >
                <LogOut className="h-3.5 w-3.5" />
                {t('nav.signOut')}
              </button>
            </div>
          ) : (
            <div className="relative ml-2 flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-[#173b2f] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#245944] hover:shadow-[0_8px_20px_rgba(23,59,47,0.2)]"
              >
                {t('nav.getStarted')} <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile Hamburger & Language Toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSelector variant="header" />
          <button
            type="button"
            aria-label={mobileOpen ? t('nav.closeNavigation') : t('nav.openNavigation')}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-b border-slate-200 bg-white p-4 shadow-xl md:hidden">
          <nav className="space-y-1.5">
            <Link
              href="/worker/jobs"
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-[#edf4ed] hover:text-[#18382c]"
            >
              <span className="flex items-center gap-2.5">
                <Briefcase className="h-4 w-4 text-[#28734f]" /> {t('nav.findWork')}
              </span>
              <span className="rounded-full bg-[#28734f] px-2 py-0.5 text-[10px] font-bold text-white">{t('common.live')}</span>
            </Link>

            <Link
              href="/worker"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-[#edf4ed] hover:text-[#18382c]"
            >
              <HardHat className="h-4 w-4 text-[#28734f]" /> {t('nav.workerSpace')}
            </Link>

            <Link
              href="/employer"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-[#edf4ed] hover:text-[#18382c]"
            >
              <Building2 className="h-4 w-4 text-[#c58b48]" /> {t('nav.forEmployers')}
            </Link>

            <Link
              href="/messages"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <MessageSquare className="h-4 w-4 text-slate-500" /> {t('nav.messages')}
            </Link>

            <Link
              href="/notifications"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Bell className="h-4 w-4 text-slate-500" /> {t('nav.alerts')}
            </Link>

            <Link
              href="/admin"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#18382c] bg-slate-50 hover:bg-slate-100"
            >
              <ShieldAlert className="h-4 w-4 text-[#28734f]" /> {t('nav.adminOps')}
            </Link>

            {/* Mobile Language Grid */}
            <LanguageSelector variant="mobile" />

            <div className="pt-3 border-t border-slate-100">
              {currentUser ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-500">
                    <span>Signed in as:</span>
                    <span className="font-bold text-slate-800">{currentUser.role}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-bold text-red-700"
                  >
                    <LogOut className="h-4 w-4" /> {t('nav.signOut')}
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173b2f] py-3 text-sm font-bold text-white shadow-md"
                >
                  {t('nav.signInOrJoin')} <ArrowRight className="h-4 w-4 rtl-flip" />
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

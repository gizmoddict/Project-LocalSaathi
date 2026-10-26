'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { UserRole } from '@localsaathi/types';
import { ShieldAlert, Sparkles, ArrowLeft, Lock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const checkUser = () => {
    try {
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      const token = apiClient.getToken();
      if (userStr && token) {
        const parsed = JSON.parse(userStr);
        if (
          parsed.role === UserRole.ADMIN ||
          parsed.role === UserRole.MODERATOR ||
          parsed.role === UserRole.SUPPORT ||
          parsed.role === 'ADMIN'
        ) {
          setCurrentUser(parsed);
          setAuthChecked(true);
          return;
        }
      }
    } catch {
      // Ignored
    }
    setCurrentUser(null);
    setAuthChecked(true);
  };

  useEffect(() => {
    checkUser();
  }, []);

  const handleAdminDemoLogin = async () => {
    setBusy(true);
    try {
      // Use seeded Admin user phone (9991587148)
      const req = await apiClient.requestOtp('9991587148', 'WORKER');
      const match = req.message.match(/\[Dev Mode\] Verification code is:\s*(\d{6})/);
      const code = match ? match[1] : '123456';
      const res = await apiClient.verifyOtp('9991587148', code, 'WORKER');
      apiClient.setToken(res.accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(res.user));
        localStorage.setItem('token', res.accessToken);
      }
      setCurrentUser(res.user);
    } catch (err: any) {
      alert('Could not authenticate demo admin. Please try from /login page.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    apiClient.setToken(null);
    router.replace('/');
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider">Verifying Ops Permissions…</p>
        </div>
      </div>
    );
  }

  // Unauthenticated Admin Gateway
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <ShieldAlert className="h-6 w-6" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
            Operations & Governance
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Access to this console requires System Administrator or Compliance Officer privileges. Sign in to inspect system health, verify audit logs, and manage disputes.
          </p>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={handleAdminDemoLogin}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {busy ? 'Authenticating…' : '1-Click Admin Demo Login'}
            </button>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800/60 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              <Lock className="h-4 w-4 text-slate-400" />
              Sign in with Phone
            </Link>

            <div className="pt-2 text-center">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
                <ArrowLeft className="h-3.5 w-3.5" /> Return to Public Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminHeader user={currentUser} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}

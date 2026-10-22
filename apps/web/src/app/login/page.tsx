'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  HardHat,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';

type AccountRole = 'WORKER' | 'EMPLOYER' | 'ADMIN';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [role, setRole] = useState<AccountRole>('WORKER');
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    const requestedRole = new URLSearchParams(window.location.search).get('role');
    if (requestedRole === 'EMPLOYER' || requestedRole === 'WORKER') {
      setRole(requestedRole);
    }
  }, []);

  // Demo user preset selector
  const selectDemoProfile = (demoPhone: string, demoRole: AccountRole) => {
    setPhone(demoPhone);
    setRole(demoRole);
    setError('');
    setNotice(`Selected preloaded ${demoRole.toLowerCase()} account (+91 ${demoPhone}). Click "Send verification code" to proceed.`);
    setOtpRequested(false);
    setOtp('');
    setDevCode(null);
  };

  const digits = phone.replace(/\D/g, '');
  const nationalNumber =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  const validPhone = /^[6-9]\d{9}$/.test(nationalNumber);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setDevCode(null);

    try {
      const sendRole = role === 'ADMIN' ? 'WORKER' : role;
      const result = await apiClient.requestOtp(nationalNumber, sendRole);
      setOtpRequested(true);
      setNotice(result.message);

      // Extract [Dev Mode] Verification code is: XXXXXX
      const match = result.message.match(/\[Dev Mode\] Verification code is:\s*(\d{6})/);
      if (match && match[1]) {
        setDevCode(match[1]);
        setOtp(match[1]); // Auto-fill for zero-friction evaluation
      }
    } catch (requestError: any) {
      setError(requestError instanceof Error ? requestError.message : 'Could not request a verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const sendRole = role === 'ADMIN' ? 'WORKER' : role;
      const result = await apiClient.verifyOtp(nationalNumber, otp.trim(), sendRole);
      
      apiClient.setToken(result.accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(result.user));
        localStorage.setItem('token', result.accessToken);
      }

      const roleStr = result.user.role as string;
      if (roleStr === 'ADMIN' || roleStr === 'MODERATOR' || roleStr === 'SUPPORT') {
        router.replace('/admin');
      } else if (roleStr === 'EMPLOYER') {
        router.replace('/employer');
      } else {
        router.replace('/worker');
      }
    } catch (verifyError: any) {
      setError(verifyError instanceof Error ? verifyError.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-enter min-h-[calc(100vh-5rem)] bg-[#f5f6f2] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[28px] border border-[#e2e7df] bg-white shadow-[0_28px_90px_rgba(22,45,33,0.1)] md:min-h-[640px] md:grid-cols-[0.9fr_1.1fr]">
        
        {/* Left Side: Brand Panel */}
        <aside className="relative flex flex-col justify-between overflow-hidden bg-[#173b2f] p-8 text-white sm:p-10">
          {/* Ambient circles */}
          <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-8 top-20 h-44 w-44 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute bottom-[-80px] left-[-60px] h-60 w-60 rounded-full bg-[#c58b48]/20 blur-3xl" />

          <div className="relative">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to LocalSaathi
            </Link>

            <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-[#e7cfaa] backdrop-blur-md">
              <ShieldCheck className="h-4 w-4" /> Secure Hyperlocal Access
            </div>

            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              Your next opportunity begins <span className="font-serif italic text-[#e2bd80]">nearby.</span>
            </h2>

            <p className="mt-3.5 text-sm leading-6 text-white/70">
              One phone-first sign-in connects you to verified jobs, instant escrow payments, and skilled local workers.
            </p>

            {/* Quick Demo Selector */}
            <div className="mt-8 rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-md">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#e2bd80]">
                <Sparkles className="h-3.5 w-3.5" /> 1-Click Demo Profiles
              </p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => selectDemoProfile('9123456780', 'WORKER')}
                  className="flex w-full items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <div className="flex items-center gap-2">
                    <HardHat className="h-4 w-4 text-emerald-400" />
                    <span>Worker: Ramesh Kumar (Plumber)</span>
                  </div>
                  <span className="text-[10px] text-emerald-300">Select</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectDemoProfile('9876543210', 'EMPLOYER')}
                  className="flex w-full items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-300" />
                    <span>Employer: Rajesh Sharma (Contractor)</span>
                  </div>
                  <span className="text-[10px] text-amber-300">Select</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectDemoProfile('9991587148', 'ADMIN')}
                  className="flex w-full items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-rose-300" />
                    <span>Admin: Platform Operations Lead</span>
                  </div>
                  <span className="text-[10px] text-rose-300">Select</span>
                </button>
              </div>
            </div>
          </div>

          <div className="relative mt-8 pt-4 border-t border-white/10 text-xs text-white/50">
            Protected by Argon2 hashing, single-use OTP challenges, and JWT session rotation.
          </div>
        </aside>

        {/* Right Side: Sign-in Form */}
        <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            {/* Step Indicator */}
            <div className="flex items-center gap-2">
              <Step active={!otpRequested} complete={otpRequested} number="01" label="Phone number" />
              <div className={`h-0.5 flex-1 ${otpRequested ? 'bg-[#28734f]' : 'bg-slate-200'}`} />
              <Step active={otpRequested} complete={false} number="02" label="Verification code" />
            </div>

            {/* Header Text */}
            <div className="mt-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-[#28734f]">
                {otpRequested ? t('auth.enterOtpLabel') : t('common.appName')}
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#18382c] sm:text-3xl">
                {otpRequested ? t('auth.enterOtpLabel') : t('auth.signInHeading')}
              </h1>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {otpRequested
                  ? t('auth.otpSentNotice', { phone })
                  : t('auth.signInSubtitle')}
              </p>
            </div>

            {/* Error & Notice Alerts */}
            {error && (
              <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-800">
                {notice}
              </div>
            )}

            {/* STEP 1: Phone & Role Selection */}
            {!otpRequested ? (
              <form onSubmit={requestOtp} className="mt-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {t('common.select')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('WORKER')}
                      className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                        role === 'WORKER'
                          ? 'border-[#28734f] bg-[#edf4ed] text-[#18382c] shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <HardHat className="h-4 w-4 text-[#28734f]" /> {t('auth.roleWorker')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('EMPLOYER')}
                      className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                        role === 'EMPLOYER'
                          ? 'border-[#c58b48] bg-[#fdf8f2] text-[#4d3a24] shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Building2 className="h-4 w-4 text-[#c58b48]" /> {t('auth.roleEmployer')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {t('auth.phoneLabel')}
                  </label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-[#fbfcfa] px-3.5 shadow-2xs transition focus-within:border-[#28734f] focus-within:ring-4 focus-within:ring-[#28734f]/10">
                    <span className="border-r border-slate-200 py-3 pr-3 text-sm font-semibold text-slate-600">
                      +91
                    </span>
                    <Smartphone className="ml-3 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      placeholder={t('auth.phonePlaceholder')}
                      value={phone}
                      onChange={(e) => {
                        const entered = e.target.value.replace(/\D/g, '');
                        setPhone(entered.slice(0, 10));
                      }}
                      className="ml-2 w-full border-0 bg-transparent py-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || !validPhone}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#173b2f] px-5 py-3.5 text-sm font-bold text-white shadow-md transition duration-200 hover:bg-[#245944] disabled:opacity-50"
                >
                  {busy ? t('auth.sendingOtp') : t('auth.sendOtpBtn')}
                  <ArrowRight className="h-4 w-4 rtl-flip" />
                </button>
              </form>
            ) : (
              /* STEP 2: OTP Entry */
              <form onSubmit={verifyOtp} className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t('auth.enterOtpLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setOtpRequested(false)}
                      className="text-xs font-semibold text-[#28734f] hover:underline"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>

                  <div className="flex items-center rounded-xl border border-slate-200 bg-[#fbfcfa] px-3.5 shadow-2xs transition focus-within:border-[#28734f] focus-within:ring-4 focus-within:ring-[#28734f]/10">
                    <KeyRound className="h-4 w-4 text-slate-400 mr-2" />
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      placeholder="••••••"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full border-0 bg-transparent py-3 text-center text-lg font-mono tracking-[0.3em] font-bold text-slate-800 outline-none"
                    />
                  </div>

                  {devCode && (
                    <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <span>{t('auth.devCodeNotice', { code: devCode })}</span>
                      <button
                        type="button"
                        onClick={() => setOtp(devCode)}
                        className="font-bold text-emerald-700 hover:underline"
                      >
                        Auto-filled ✓
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy || otp.length < 6}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#173b2f] px-5 py-3.5 text-sm font-bold text-white shadow-md transition duration-200 hover:bg-[#245944] disabled:opacity-50"
                >
                  {busy ? t('auth.verifying') : t('auth.verifyBtn')}
                  <ArrowRight className="h-4 w-4 rtl-flip" />
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Step({
  active,
  complete,
  number,
  label,
}: {
  active: boolean;
  complete: boolean;
  number: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
          complete
            ? 'bg-[#28734f] text-white'
            : active
            ? 'bg-[#173b2f] text-white'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        {complete ? <Check className="h-3 w-3" /> : number}
      </span>
      <span className={active || complete ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
    </div>
  );
}

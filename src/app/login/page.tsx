'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2, Check, HardHat, KeyRound, Mail, ShieldAlert, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';

type Role = 'WORKER' | 'EMPLOYER' | 'ADMIN';
type Profile = { fullName: string; email: string; address: string; trade: string; experienceYears: string; preferredRadiusKm: string; expectedWage: string; workPreference: string; preferredLocation: string; isAvailable: boolean; businessName: string; businessType: string; city: string; pinCode: string; consent: boolean };
const emptyProfile: Profile = { fullName: '', email: '', address: '', trade: '', experienceYears: '', preferredRadiusKm: '10', expectedWage: '', workPreference: '', preferredLocation: '', isAvailable: true, businessName: '', businessType: '', city: '', pinCode: '', consent: false };

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [phone, setPhone] = useState('');
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [loginEmail, setLoginEmail] = useState('');
  const [role, setRole] = useState<Role>('WORKER');
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ACCOUNTS_ENABLED !== 'false';
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const validPhone = /^[6-9]\d{9}$/.test(digits);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail.trim());
  const identifierType = mode === 'login' ? loginMethod : 'phone';
  const identifier = identifierType === 'email' ? loginEmail.trim().toLowerCase() : digits;
  const validIdentifier = identifierType === 'email' ? validEmail && validPhone : validPhone;

  useEffect(() => {
    const requestedRole = new URLSearchParams(window.location.search).get('role');
    if (requestedRole === 'EMPLOYER' || requestedRole === 'WORKER') setRole(requestedRole);
  }, []);
  useEffect(() => {
    if (resendSeconds < 1) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function updateProfile(key: keyof Profile, value: string | boolean) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function routeUser(userRole: string) {
    router.replace(['ADMIN', 'MODERATOR', 'SUPPORT'].includes(userRole) ? '/admin' : userRole === 'EMPLOYER' ? '/employer' : '/worker');
  }

  async function completeSignIn(result: Awaited<ReturnType<typeof apiClient.demoLogin>>) {
    apiClient.setToken(result.accessToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    routeUser(result.user.role);
  }

  async function demoSignIn(demoRole: Role) {
    setError(''); setNotice('');
    if (!demoEnabled) {
      setMode('login'); setRole(demoRole); setPhone(demoRole === 'WORKER' ? '9123456780' : demoRole === 'EMPLOYER' ? '9876543210' : '9999999999');
      setNotice('Demonstration profile selected. Demo access is disabled in this environment.');
      return;
    }
    setBusy(true);
    try { await completeSignIn(await apiClient.demoLogin(demoRole)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the demonstration account.'); }
    finally { setBusy(false); }
  }

  async function requestOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true); setError(''); setNotice(''); setDevCode(null);
    try {
      const result = await apiClient.requestOtp(identifier, role, mode, identifierType, identifierType === 'email' ? digits : undefined);
      setOtpRequested(true); setNotice(result.message); setResendSeconds(60);
      const match = result.message.match(/\[Dev Mode\] Verification code is:\s*(\d{6})/);
      if (match?.[1]) { setOtp(match[1]); setDevCode(match[1]); }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not request a verification code.';
      const remaining = message.match(/wait\s+(\d+)\s+seconds/i);
      if (remaining?.[1]) setResendSeconds(Number(remaining[1]));
      setError(message);
    }
    finally { setBusy(false); }
  }

  async function resendOtp() { if (resendSeconds || busy) return; await requestOtp(); }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await apiClient.verifyOtp(identifier, otp.trim(), role, mode, mode === 'signup' ? profile : undefined, identifierType, identifierType === 'email' ? digits : undefined);
      apiClient.setToken(result.accessToken);
      localStorage.setItem('user', JSON.stringify(result.user));
      if (mode === 'signup') router.replace(result.user.role === 'EMPLOYER' ? '/employer/onboarding' : '/worker/onboarding');
      else routeUser(result.user.role);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not verify the code.'); }
    finally { setBusy(false); }
  }

  const pickDemo = (nextRole: Role) => { void demoSignIn(nextRole); };

  return <div className="page-enter min-h-[calc(100vh-5rem)] bg-[#f5f6f2] px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[28px] border border-[#e2e7df] bg-white shadow-[0_28px_90px_rgba(22,45,33,0.1)] md:min-h-[640px] md:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-[#173b2f] p-8 text-white sm:p-10">
        <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full border border-white/10"/><div className="pointer-events-none absolute bottom-[-80px] left-[-60px] h-60 w-60 rounded-full bg-[#c58b48]/20 blur-3xl"/>
        <div className="relative"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white"><ArrowLeft className="h-4 w-4"/>Back to LocalSaathi</Link>
          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-[#e7cfaa]"><ShieldCheck className="h-4 w-4"/>Secure Hyperlocal Access</div>
          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">Your next opportunity begins <span className="font-serif italic text-[#e2bd80]">nearby.</span></h2>
          <p className="mt-3.5 text-sm leading-6 text-white/70">Explore LocalSaathi from the perspective of a worker, local business, or platform administrator.</p>
          <div className="mt-7 rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-md">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#e2bd80]"><Sparkles className="h-3.5 w-3.5"/>1-Click Demo Profiles</p>
            <p className="mt-1 text-[11px] text-white/60">Demonstration accounts let new visitors explore the experience.</p>
            <div className="mt-3 space-y-2">
              <DemoButton icon={<HardHat className="h-4 w-4 text-emerald-400"/>} label="Worker: Ramesh Kumar (Plumber)" disabled={busy} onClick={() => pickDemo('WORKER')}/>
              <DemoButton icon={<Building2 className="h-4 w-4 text-amber-300"/>} label="Employer: Rajesh Sharma (Contractor)" disabled={busy} onClick={() => pickDemo('EMPLOYER')}/>
              <DemoButton icon={<ShieldAlert className="h-4 w-4 text-rose-300"/>} label="Admin: Platform Operations Lead" disabled={busy} onClick={() => pickDemo('ADMIN')}/>
            </div>
            <p className="mt-2 text-[10px] text-white/55">Seeded test accounts. Access is controlled by DEMO_ACCOUNTS_ENABLED and disabled by default in production.</p>
          </div>
        </div>
        <p className="relative mt-7 border-t border-white/10 pt-4 text-xs text-white/50">Phone verification and secure account sessions.</p>
      </aside>

      <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12"><div className="mx-auto w-full max-w-md">
        {!otpRequested && <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); setNotice(''); }} className={`rounded-lg px-3 py-2.5 text-sm font-bold ${mode === 'login' ? 'bg-white text-[#18382c] shadow-sm' : 'text-slate-500'}`}>Sign In</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => { setMode('signup'); if (role === 'ADMIN') setRole('WORKER'); setError(''); setNotice(''); }} className={`rounded-lg px-3 py-2.5 text-sm font-bold ${mode === 'signup' ? 'bg-white text-[#18382c] shadow-sm' : 'text-slate-500'}`}>Create Account</button>
        </div>}
        <div className="flex items-center gap-2"><Step active={!otpRequested} complete={otpRequested} n="01" label={mode === 'signup' ? 'Your details' : 'Sign-in method'}/><div className={`h-0.5 flex-1 ${otpRequested ? 'bg-[#28734f]' : 'bg-slate-200'}`}/><Step active={otpRequested} complete={false} n="02" label="Verification"/></div>
        <div className="mt-7"><p className="text-[11px] font-bold uppercase tracking-[0.17em] text-[#28734f]">{t('common.appName')}</p><h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#18382c] sm:text-3xl">{otpRequested ? 'Verify your account' : mode === 'login' ? t('auth.signInHeading') : 'Create your account'}</h1><p className="mt-2 text-xs leading-5 text-slate-500">{otpRequested ? `Enter the 6-digit code sent to +91 ${digits}.` : mode === 'login' ? t('auth.signInSubtitle') : 'Create a phone-verified Worker or Employer account.'}</p></div>
        {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">{error}</div>}
        {notice && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-800">{notice}</div>}
        {!otpRequested ? <form onSubmit={requestOtp} className="mt-6 space-y-4">
          {mode === 'login' ? <div><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Sign in with</span><div className="grid grid-cols-2 gap-3"><RoleButton active={loginMethod === 'phone'} onClick={() => setLoginMethod('phone')} icon={<Smartphone className="h-4 w-4"/>} label="Phone"/><RoleButton active={loginMethod === 'email'} onClick={() => setLoginMethod('email')} icon={<Mail className="h-4 w-4"/>} label="Email"/></div></div> : <div><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Account type</span><div className="grid grid-cols-2 gap-3"><RoleButton active={role === 'WORKER'} onClick={() => setRole('WORKER')} icon={<HardHat className="h-4 w-4"/>} label="Worker"/><RoleButton active={role === 'EMPLOYER'} onClick={() => setRole('EMPLOYER')} icon={<Building2 className="h-4 w-4"/>} label="Employer"/></div></div>}
          {mode === 'signup' && <>
            <Field label="Full name" value={profile.fullName} onChange={(v) => updateProfile('fullName',v)} required autoComplete="name"/>
            <Field label="Email address (optional)" type="email" value={profile.email} onChange={(v) => updateProfile('email',v)} autoComplete="email"/>
            <Field label="Address" value={profile.address} onChange={(v) => updateProfile('address',v)} required autoComplete="street-address"/>
            {role === 'WORKER' ? <><div className="grid grid-cols-2 gap-3"><Field label="Trade / skill" value={profile.trade} onChange={(v) => updateProfile('trade',v)} placeholder="Optional"/><Field label="Experience (years)" type="number" value={profile.experienceYears} onChange={(v) => updateProfile('experienceYears',v)} min="0" max="60"/></div><div className="grid grid-cols-2 gap-3"><Field label="Expected wage" type="number" value={profile.expectedWage} onChange={(v) => updateProfile('expectedWage',v)} min="1" placeholder="Optional"/><Field label="Job radius (km)" type="number" value={profile.preferredRadiusKm} onChange={(v) => updateProfile('preferredRadiusKm',v)} min="1" max="100"/></div><Field label="Work preference (optional)" value={profile.workPreference} onChange={(v) => updateProfile('workPreference',v)} placeholder="Full-time, part-time, contract"/><Field label="Preferred work location (optional)" value={profile.preferredLocation} onChange={(v) => updateProfile('preferredLocation',v)} placeholder="Area or city"/><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={profile.isAvailable} onChange={(e) => updateProfile('isAvailable',e.target.checked)} className="accent-[#28734f]"/>Available for work</label><p className="text-[11px] text-slate-500">Use profile onboarding to pin your work location on the map.</p></> : <><Field label="Business name" value={profile.businessName} onChange={(v) => updateProfile('businessName',v)} required/><div className="grid grid-cols-2 gap-3"><Field label="Business type / trade" value={profile.businessType} onChange={(v) => updateProfile('businessType',v)} placeholder="Optional"/><Field label="City" value={profile.city} onChange={(v) => updateProfile('city',v)}/></div><Field label="PIN code" value={profile.pinCode} onChange={(v) => updateProfile('pinCode',v)} inputMode="numeric" maxLength={6}/><p className="text-[11px] text-slate-500">Business verification is separate; new accounts are not marked verified.</p></>}
            <label className="flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={profile.consent} onChange={(e) => updateProfile('consent',e.target.checked)} required className="mt-1 accent-[#28734f]"/><span>I agree to the LocalSaathi Terms and Privacy Policy.</span></label>
          </>}
          {mode === 'login' && loginMethod === 'email' && <div><label htmlFor="login-email" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Email address</label><div className="flex items-center rounded-xl border border-slate-200 bg-[#fbfcfa] px-3.5 focus-within:border-[#28734f] focus-within:ring-4 focus-within:ring-[#28734f]/10"><Mail className="mr-3 h-4 w-4 text-slate-400"/><input id="login-email" type="email" inputMode="email" autoComplete="email" required maxLength={255} placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full bg-transparent py-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300"/></div><p className="mt-1.5 text-[11px] text-slate-500">Enter the mobile number on that account too. We’ll text its verification code.</p></div>}
          <div><label htmlFor="phone" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{mode === 'login' && loginMethod === 'email' ? 'Account mobile number' : t('auth.phoneLabel')}</label><div className="flex items-center rounded-xl border border-slate-200 bg-[#fbfcfa] px-3.5 focus-within:border-[#28734f] focus-within:ring-4 focus-within:ring-[#28734f]/10"><span className="border-r border-slate-200 py-3 pr-3 text-sm font-semibold text-slate-600">+91</span><Smartphone className="ml-3 h-4 w-4 text-slate-400"/><input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={10} placeholder={t('auth.phonePlaceholder')} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g,'').slice(-10))} className="ml-2 w-full bg-transparent py-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300"/></div></div>
          <button type="submit" disabled={busy || !validIdentifier} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#173b2f] px-5 py-3.5 text-sm font-bold text-white shadow-md hover:bg-[#245944] disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Send sign-in code' : 'Send code to verify & sign up'}<ArrowRight className="h-4 w-4"/></button>
        </form> : <form onSubmit={verifyOtp} className="mt-6 space-y-5"><div><div className="mb-2 flex items-center justify-between"><label htmlFor="otp" className="text-xs font-bold uppercase tracking-wider text-slate-500">Verification code</label><button type="button" onClick={() => { setOtpRequested(false); setOtp(''); setError(''); }} className="text-xs font-semibold text-[#28734f] hover:underline">Change mobile number</button></div><div className="flex items-center rounded-xl border border-slate-200 bg-[#fbfcfa] px-3.5 focus-within:border-[#28734f] focus-within:ring-4 focus-within:ring-[#28734f]/10"><KeyRound className="mr-2 h-4 w-4 text-slate-400"/><input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="••••••" className="w-full bg-transparent py-3 text-center font-mono text-lg font-bold tracking-[0.3em] outline-none"/></div>{devCode && <p className="mt-2 text-xs text-emerald-800">Development code auto-filled for local testing.</p>}</div><button type="submit" disabled={busy || otp.length !== 6} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#173b2f] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#245944] disabled:opacity-50">{busy ? 'Verifying…' : mode === 'login' ? 'Sign in' : 'Verify and create account'}<ArrowRight className="h-4 w-4"/></button><div className="flex justify-between text-xs"><span className="text-slate-500">Code expires after a short time.</span><button type="button" disabled={busy || resendSeconds > 0} onClick={() => void resendOtp()} className="font-semibold text-[#28734f] disabled:text-slate-400">{resendSeconds ? `Resend in ${resendSeconds}s` : 'Resend code'}</button></div></form>}
      </div></section>
    </div>
  </div>;
}

function DemoButton({icon,label,disabled,onClick}:{icon:ReactNode;label:string;disabled:boolean;onClick:()=>void}) { return <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"><span className="flex items-center gap-2">{icon}{label}</span><span className="text-[10px] text-emerald-300">{disabled?'Wait':'Open'}</span></button>; }
function RoleButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:ReactNode;label:string}) { return <button type="button" aria-pressed={active} onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${active?'border-[#28734f] bg-[#edf4ed] text-[#18382c]':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{icon}{label}</button>; }
function Field({label,value,onChange,required=false,type='text',...props}:{label:string;value:string;onChange:(value:string)=>void;required?:boolean;type?:string;[key:string]:any}) { const id=label.toLowerCase().replace(/[^a-z0-9]+/g,'-');return <div><label htmlFor={id} className="mb-1.5 block text-xs font-bold text-slate-600">{label}{required?' *':''}</label><input id={id} type={type} value={value} onChange={(e)=>onChange(e.target.value)} required={required} {...props} className="w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-3.5 py-3 text-sm outline-none focus:border-[#28734f] focus:ring-4 focus:ring-[#28734f]/10"/></div>; }
function Step({active,complete,n,label}:{active:boolean;complete:boolean;n:string;label:string}) { return <div className="flex items-center gap-2 text-xs font-semibold"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${complete?'bg-[#28734f] text-white':active?'bg-[#173b2f] text-white':'bg-slate-100 text-slate-400'}`}>{complete?<Check className="h-3 w-3"/>:n}</span><span className={active||complete?'text-slate-800':'text-slate-400'}>{label}</span></div>; }

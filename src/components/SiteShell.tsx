'use client';

import { usePathname } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { FirstVisitLanguagePrompt } from '@/components/i18n/FirstVisitLanguagePrompt';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <div className="min-h-screen bg-slate-950">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8f5]">
      <FirstVisitLanguagePrompt />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

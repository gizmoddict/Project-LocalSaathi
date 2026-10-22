import type { Metadata, Viewport } from 'next';
import './globals.css';
import SiteShell from '@/components/SiteShell';
import { I18nProvider } from '@/i18n/context';

export const metadata: Metadata = {
  title: 'LocalSaathi | Hyperlocal Employment Platform',
  description:
    'Connecting informal and skilled workers with nearby jobs, fair wages, and trusted employers.',
};

export const viewport: Viewport = {
  themeColor: '#173b2f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans bg-[#f7f8f5] text-slate-900 antialiased selection:bg-[#16734f] selection:text-white">
        <I18nProvider>
          <SiteShell>{children}</SiteShell>
        </I18nProvider>
      </body>
    </html>
  );
}

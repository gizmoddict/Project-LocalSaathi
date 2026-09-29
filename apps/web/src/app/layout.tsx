import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LocalSaathi | Hyperlocal Employment Platform',
  description:
    'Connecting informal and skilled workers with nearby jobs, fair wages, and trusted employers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                LS
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight text-slate-900">
                  Local<span className="text-emerald-600">Saathi</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Phase 1 Monorepo
                </span>
              </div>
            </div>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <span className="px-3 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono">
                API: /api/v1
              </span>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-6">
          <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500">
            LocalSaathi Platform &copy; {new Date().getFullYear()}. Production Monorepo Foundation.
          </div>
        </footer>
      </body>
    </html>
  );
}

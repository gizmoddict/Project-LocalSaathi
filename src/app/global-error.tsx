'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center font-sans bg-[#f7f8f5] p-4 text-slate-900">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Critical Application Error</h2>
          <p className="text-sm text-slate-600 mb-6">
            {error?.message || 'A critical error occurred while initializing the application.'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 bg-[#173b2f] text-white rounded-xl text-sm font-semibold hover:bg-[#122e25] transition-colors"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}

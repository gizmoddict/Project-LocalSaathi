'use client';

import React, { useEffect } from 'react';
import { Button } from '@localsaathi/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-600 mb-6">
          {error?.message || 'An unexpected error occurred while loading this page.'}
        </p>
        <Button
          onClick={() => reset()}
          className="bg-[#173b2f] hover:bg-[#122e25] text-white"
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Try Again
        </Button>
      </div>
    </div>
  );
}

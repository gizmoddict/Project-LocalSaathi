'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'USER' | 'JOB' | 'MESSAGE';
  targetId: string;
  targetName?: string;
  onReportSubmitted?: () => void;
}

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
  onReportSubmitted,
}: ReportModalProps) {
  const [reason, setReason] = useState('HARASSMENT');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (targetType === 'USER') {
        await apiClient.reportUser(targetId, { reason, details });
      } else if (targetType === 'JOB') {
        await apiClient.reportJob(targetId, { reason, details });
      } else if (targetType === 'MESSAGE') {
        await apiClient.reportMessageSafety(targetId, { reason, details });
      }

      setSuccess(true);
      if (onReportSubmitted) onReportSubmitted();
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Report {targetType.toLowerCase()}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {targetName && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Target: <span className="font-medium text-slate-800 dark:text-slate-200">{targetName}</span>
          </p>
        )}

        {success ? (
          <div className="my-6 rounded-lg bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            ✓ Report received. Our safety team will review this shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Report
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="HARASSMENT">Harassment or abusive behavior</option>
                <option value="SPAM">Spam or unwanted advertising</option>
                <option value="FRAUD">Fraud or financial deception</option>
                <option value="SAFETY_CONCERN">Personal safety concern</option>
                <option value="INAPPROPRIATE_CONTENT">Inappropriate or offensive content</option>
                <option value="IMPERSONATION">Impersonation or fake profile</option>
                <option value="OTHER">Other violation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Details (Optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Please describe what happened..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

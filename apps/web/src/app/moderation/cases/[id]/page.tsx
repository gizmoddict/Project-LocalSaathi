'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function ModerationCaseDetailPage() {
  const params = useParams();
  const caseId = params?.id as string;

  const [caseData, setCaseData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states
  const [resolutionAction, setResolutionAction] = useState('WARNING');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('Terms of service violation');

  const loadCase = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const data = await apiClient.getModerationCase(caseId);
      setCaseData(data);
    } catch (err: any) {
      setActionError(`Failed to load case: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCase();
  }, [caseId]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiClient.resolveModerationCase(caseId, {
        resolution: resolutionAction,
        notes: resolutionNotes,
      });
      setActionSuccess('Case successfully resolved.');
      loadCase();
    } catch (err: any) {
      setActionError(`Resolve failed: ${err.message}`);
    }
  };

  const handleApproveVerification = async () => {
    if (!caseData?.verification?.id) return;
    try {
      await apiClient.approveVerification(caseData.verification.id, 'Documents verified by moderator.');
      setActionSuccess('Verification approved.');
      loadCase();
    } catch (err: any) {
      setActionError(`Approval failed: ${err.message}`);
    }
  };

  const handleRejectVerification = async () => {
    if (!caseData?.verification?.id) return;
    try {
      await apiClient.rejectVerification(caseData.verification.id, resolutionNotes || 'Incomplete documentation.');
      setActionSuccess('Verification rejected.');
      loadCase();
    } catch (err: any) {
      setActionError(`Rejection failed: ${err.message}`);
    }
  };

  const handleSuspendTargetUser = async () => {
    if (!caseData) return;
    try {
      const targetUserId =
        caseData.targetEntityType === 'User'
          ? caseData.targetEntityId
          : caseData.verification?.userId;
      if (!targetUserId) {
        throw new Error('Target user ID could not be identified for this case.');
      }
      await apiClient.suspendUser(targetUserId, suspensionReason);
      setActionSuccess('User account suspended and active sessions revoked.');
      loadCase();
    } catch (err: any) {
      setActionError(`Suspension failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <p className="text-sm text-slate-500">Loading case details...</p>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-rose-600">Case not found.</p>
          <Link href="/moderation" className="mt-4 inline-block text-sm text-amber-600 underline">
            Back to Queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/moderation" className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400">
            ← Back to Moderation Queue
          </Link>
          <span className="font-mono text-sm font-bold text-amber-600">{caseData.caseNumber}</span>
        </div>

        {actionError && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {actionSuccess}
          </div>
        )}

        {/* Case Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{caseData.title}</h1>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              {caseData.caseType}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {caseData.status}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{caseData.description}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Created: {new Date(caseData.createdAt).toLocaleString()}</span>
            <span>Assigned: {caseData.assignedTo?.phone ?? 'Unassigned'}</span>
            <span>Target: {caseData.targetEntityType} ({caseData.targetEntityId.substring(0, 8)})</span>
          </div>
        </div>

        {/* Verification View */}
        {caseData.verification && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
              Identity Verification Documents ({caseData.verification.verificationType})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {caseData.verification.documents.map((doc: any) => (
                <div key={doc.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{doc.type}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">Key: {doc.objectStorageKey}</p>
                  <p className="text-xs text-slate-500">MIME: {doc.mimeType} | Size: {(doc.fileSizeBytes / 1024).toFixed(1)} KB</p>
                  <p className="text-xs font-bold text-amber-600 mt-2">Status: {doc.verificationStatus}</p>
                </div>
              ))}
            </div>

            {caseData.status !== 'RESOLVED' && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleApproveVerification}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Approve Verification
                </button>
                <button
                  onClick={handleRejectVerification}
                  className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                >
                  Reject Verification
                </button>
              </div>
            )}
          </div>
        )}

        {/* Reports Filed */}
        {caseData.reports && caseData.reports.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
              Reports Filed ({caseData.reports.length})
            </h2>
            <div className="space-y-3">
              {caseData.reports.map((r: any) => (
                <div key={r.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                      Reason: {r.reason}
                    </span>
                    <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Details: {r.details ?? 'No additional details provided.'}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Reporter: {r.reporter?.name} ({r.reporter?.role})
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolution Controls */}
        {caseData.status !== 'RESOLVED' && caseData.status !== 'DISMISSED' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
              Case Resolution & Enforcement
            </h2>
            <form onSubmit={handleResolve} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Resolution Action
                  </label>
                  <select
                    value={resolutionAction}
                    onChange={(e) => setResolutionAction(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="WARNING">Issue Formal Warning</option>
                    <option value="CONTENT_REMOVAL">Content Removal</option>
                    <option value="CAPABILITY_RESTRICTION">Apply Capability Restriction</option>
                    <option value="SUSPENSION">Account Suspension</option>
                    <option value="SETTLE_DISPUTE">Settle Booking Dispute</option>
                    <option value="DISMISS">Dismiss Case</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Resolution Notes
                  </label>
                  <input
                    type="text"
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Findings and action reasoning..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Suspension Reason (if suspending)
                  </label>
                  <input
                    type="text"
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                    placeholder="Reason for account suspension..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Resolve Case
                </button>
                <button
                  type="button"
                  onClick={handleSuspendTargetUser}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Suspend Target Account
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Action Audit Trail */}
        {caseData.actions && caseData.actions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
              Action History ({caseData.actions.length})
            </h2>
            <div className="space-y-2">
              {caseData.actions.map((act: any) => (
                <div key={act.id} className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{act.actionType}</span>
                    <span className="ml-2 text-slate-500">{act.notes}</span>
                  </div>
                  <span className="text-slate-400">{new Date(act.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

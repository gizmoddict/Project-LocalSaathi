'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { VerificationBadge } from '@/components/trust-safety/VerificationBadge';

export default function WorkerVerificationPage() {
  const [statusData, setStatusData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [verificationType, setVerificationType] = useState('AADHAAR');
  const [docType, setDocType] = useState('GOVERNMENT_ID');
  const [objectStorageKey, setObjectStorageKey] = useState('');
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [fileSizeBytes, setFileSizeBytes] = useState(102400);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getVerificationStatus();
      setStatusData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load verification status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const key = objectStorageKey.trim() || `verifications/usr-${Date.now()}/${docType.toLowerCase()}_sample.jpg`;

    try {
      await apiClient.submitVerification({
        verificationType,
        documents: [
          {
            type: docType,
            objectStorageKey: key,
            mimeType,
            fileSizeBytes: Number(fileSizeBytes),
          },
        ],
      });
      setSuccess('Verification documents submitted successfully for review.');
      loadStatus();
    } catch (err: any) {
      setError(err.message || 'Verification submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/worker" className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400">
            ← Back to Worker Dashboard
          </Link>
          {statusData && <VerificationBadge status={statusData.overallStatus} size="lg" />}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Worker Identity & Trust Verification
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Verified workers get priority job discovery, higher trustworthiness, and verified badge on employer applications.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {success}
          </div>
        )}

        {/* Status Card */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading verification status...
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Current Status</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-300">Account Trust Level:</span>
              <VerificationBadge status={statusData?.overallStatus || 'UNVERIFIED'} />
            </div>

            {statusData?.latestVerification && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/40 space-y-1 text-slate-600 dark:text-slate-300">
                <p>
                  <span className="font-semibold">Document Type:</span> {statusData.latestVerification.verificationType}
                </p>
                <p>
                  <span className="font-semibold">Submitted:</span> {new Date(statusData.latestVerification.submittedAt).toLocaleDateString()}
                </p>
                {statusData.latestVerification.caseNumber && (
                  <p>
                    <span className="font-semibold">Review Case:</span> {statusData.latestVerification.caseNumber}
                  </p>
                )}
                {statusData.latestVerification.rejectionReason && (
                  <p className="text-rose-600 font-semibold">
                    Rejection Reason: {statusData.latestVerification.rejectionReason}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Verification Submission Form */}
        {statusData?.overallStatus !== 'VERIFIED' && statusData?.overallStatus !== 'PENDING' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
              Submit Verification Documents
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Identity Document Type
                </label>
                <select
                  value={verificationType}
                  onChange={(e) => setVerificationType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="AADHAAR">Aadhaar Card</option>
                  <option value="PAN">PAN Card</option>
                  <option value="DRIVING_LICENSE">Driving License</option>
                  <option value="VOTER_ID">Voter ID</option>
                  <option value="PASSPORT">Passport</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Document Category
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="GOVERNMENT_ID">Government Issued Photo ID</option>
                  <option value="TRADE_CERTIFICATE">Trade / Skill Certificate</option>
                  <option value="ADDRESS_PROOF">Address Proof</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    MIME Format
                  </label>
                  <select
                    value={mimeType}
                    onChange={(e) => setMimeType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="image/jpeg">JPEG Image (.jpg)</option>
                    <option value="image/png">PNG Image (.png)</option>
                    <option value="image/webp">WebP Image (.webp)</option>
                    <option value="application/pdf">PDF Document (.pdf)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    File Size (Bytes)
                  </label>
                  <input
                    type="number"
                    value={fileSizeBytes}
                    onChange={(e) => setFileSizeBytes(Number(e.target.value))}
                    max={5242880}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="text-[10px] text-slate-400">Maximum allowed: 5,242,880 bytes (5MB)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Storage Reference Key (Mock/Cloud Storage Key)
                </label>
                <input
                  type="text"
                  placeholder="verifications/user-id/aadhaar_doc.jpg"
                  value={objectStorageKey}
                  onChange={(e) => setObjectStorageKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-amber-600 p-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting Verification...' : 'Submit Verification Request'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

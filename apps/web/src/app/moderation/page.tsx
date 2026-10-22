'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function ModerationDashboardPage() {
  const [activeTab, setActiveTab] = useState<'cases' | 'verifications' | 'disputes' | 'audit'>('cases');
  const [cases, setCases] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      if (activeTab === 'cases') {
        const res = await apiClient.getModerationCases({
          status: statusFilter || undefined,
        });
        setCases(res.items || []);
      } else if (activeTab === 'verifications') {
        const res = await apiClient.getModerationCases({
          caseType: 'VERIFICATION',
          status: statusFilter || undefined,
        });
        setVerifications(res.items || []);
      } else if (activeTab === 'disputes') {
        const res = await apiClient.getModerationCases({
          caseType: 'DISPUTE',
          status: statusFilter || undefined,
        });
        setDisputes(res.items || []);
      } else if (activeTab === 'audit') {
        const res = await apiClient.getTrustAuditLogs({ limit: 30 });
        setAuditLogs(res.items || []);
      }
    } catch (err: any) {
      setActionMessage(`Error loading: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, statusFilter]);

  const handleClaim = async (caseId: string) => {
    try {
      await apiClient.claimModerationCase(caseId);
      setActionMessage('Case claimed successfully.');
      loadData();
    } catch (err: any) {
      setActionMessage(`Claim failed: ${err.message}`);
    }
  };

  const handleDismiss = async (caseId: string) => {
    try {
      await apiClient.dismissModerationCase(caseId, 'Dismissed from moderation queue.');
      setActionMessage('Case dismissed.');
      loadData();
    } catch (err: any) {
      setActionMessage(`Dismiss failed: ${err.message}`);
    }
  };

  const handleEscalate = async (caseId: string) => {
    try {
      await apiClient.escalateModerationCase(caseId, { notes: 'Escalated by reviewer.' });
      setActionMessage('Case escalated to CRITICAL priority.');
      loadData();
    } catch (err: any) {
      setActionMessage(`Escalate failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Trust & Safety Moderation Desk
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Operations queue for user reports, verifications, booking disputes, and safety enforcement.
            </p>
          </div>
          <button
            onClick={loadData}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Refresh Queue
          </button>
        </div>

        {actionMessage && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {actionMessage}
          </div>
        )}

        {/* Tab Controls */}
        <div className="mb-6 flex border-b border-slate-200 dark:border-slate-800">
          {(['cases', 'verifications', 'disputes', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setStatusFilter('');
              }}
              className={`px-5 py-3 text-sm font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'audit' ? 'Audit Trail' : tab}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        {activeTab !== 'audit' && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Filter Status:</span>
            {['', 'PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {st || 'All'}
              </button>
            ))}
          </div>
        )}

        {/* Content Table / Cards */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Loading queue records...
          </div>
        ) : activeTab === 'audit' ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No audit records found.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {log.entityType}:{log.entityId?.substring(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-xs">{log.actor?.phone ?? 'System'}</td>
                      <td className="px-4 py-3 text-xs">{log.ipAddress ?? '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            {((activeTab === 'cases' ? cases : activeTab === 'verifications' ? verifications : disputes) || []).length ===
            0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                No moderation cases matching current filters.
              </div>
            ) : (
              (activeTab === 'cases' ? cases : activeTab === 'verifications' ? verifications : disputes).map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                          {item.caseNumber}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            item.priority === 'CRITICAL' || item.priority === 'HIGH'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {item.priority}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.status === 'RESOLVED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : item.status === 'UNDER_REVIEW'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.description ?? 'No extra details provided.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === 'PENDING' && (
                        <button
                          onClick={() => handleClaim(item.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Claim Case
                        </button>
                      )}
                      {item.status !== 'RESOLVED' && item.status !== 'DISMISSED' && (
                        <>
                          <button
                            onClick={() => handleEscalate(item.id)}
                            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                          >
                            Escalate
                          </button>
                          <button
                            onClick={() => handleDismiss(item.id)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      <Link
                        href={`/moderation/cases/${item.id}`}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900"
                      >
                        Review Details →
                      </Link>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

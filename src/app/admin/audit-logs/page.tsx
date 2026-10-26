'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminAuditLogItem } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { History, Lock } from 'lucide-react';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLog, setSelectedLog] = useState<AdminAuditLogItem | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminAuditLogs({
        page,
        limit,
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
      });
      setLogs(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch audit log trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, entityTypeFilter]);

  const columns: Column<AdminAuditLogItem>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (l) => (
        <span className="font-mono text-slate-300">
          {new Date(l.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Operational Action',
      render: (l) => (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-800 text-slate-200 border border-slate-700">
          {l.action}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Target Entity',
      render: (l) => (
        <div>
          <span className="font-semibold text-slate-200">{l.entityType}</span>
          <div className="font-mono text-[10px] text-slate-500">{l.entityId}</div>
        </div>
      ),
    },
    {
      key: 'actorId',
      header: 'Actor ID / Staff',
      render: (l) => (
        <div>
          <span className="text-slate-300 font-mono text-[11px]">{l.actorId ? `${l.actorId.slice(0, 8)}...` : 'System'}</span>
          <div className="text-[10px] text-slate-500">{l.actorPhone || 'Internal'}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <span>Immutable Audit Log Trail</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographically indexed, append-only governance trail of all operational modifications.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Read-Only Compliance</span>
        </div>
      </div>

      <FilterBar
        filters={[
          {
            id: 'action',
            label: 'Action Filter',
            value: actionFilter,
            options: [
              { label: 'All Actions', value: '' },
              { label: 'SUSPEND_USER', value: 'SUSPEND_USER' },
              { label: 'REINSTATE_USER', value: 'REINSTATE_USER' },
              { label: 'PAUSE_JOB', value: 'PAUSE_JOB' },
              { label: 'RESUME_JOB', value: 'RESUME_JOB' },
              { label: 'CLAIM_CASE', value: 'CLAIM_CASE' },
              { label: 'RESOLVE_CASE', value: 'RESOLVE_CASE' },
            ],
            onChange: (val) => {
              setActionFilter(val);
              setPage(1);
            },
          },
          {
            id: 'entity',
            label: 'Entity Type',
            value: entityTypeFilter,
            options: [
              { label: 'All Entities', value: '' },
              { label: 'User', value: 'User' },
              { label: 'JobPost', value: 'JobPost' },
              { label: 'ModerationCase', value: 'ModerationCase' },
              { label: 'Booking', value: 'Booking' },
            ],
            onChange: (val) => {
              setEntityTypeFilter(val);
              setPage(1);
            },
          },
        ]}
        onReset={() => {
          setActionFilter('');
          setEntityTypeFilter('');
          setPage(1);
        }}
        loading={loading}
      />

      {error && (
        <div className="p-3 rounded-lg border border-rose-800 bg-rose-950/50 text-xs text-rose-300">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        emptyMessage="No audit log records found."
        onRowClick={(l) => setSelectedLog(l)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Record Metadata"
        subtitle={selectedLog ? `ID: ${selectedLog.id}` : ''}
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-mono text-slate-200">
                  {new Date(selectedLog.createdAt).toISOString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Action:</span>
                <span className="font-mono text-emerald-400 font-semibold">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Entity:</span>
                <span className="text-slate-200">{selectedLog.entityType} ({selectedLog.entityId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Actor User:</span>
                <span className="font-mono text-slate-300">{selectedLog.actorId || 'System'}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 block mb-1.5 font-semibold">Structured Audit Metadata:</span>
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

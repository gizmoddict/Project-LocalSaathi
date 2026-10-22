'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminReportItem, ReportStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { DetailDrawer } from '@/components/admin/DetailDrawer';

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] = useState<AdminReportItem | null>(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminReports({
        page,
        limit,
        status: (statusFilter as ReportStatus) || undefined,
      });
      setReports(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch abuse reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter]);

  const columns: Column<AdminReportItem>[] = [
    {
      key: 'reporterId',
      header: 'Reporter & Target',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-100">Target: {r.targetType}</span>
          <div className="font-mono text-[10px] text-slate-400">Target ID: {r.targetId}</div>
          <div className="text-[10px] text-slate-500 font-mono">By User: {r.reporterId}</div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason / Category',
      render: (r) => <span className="font-medium text-amber-300">{r.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} type="report" />,
    },
    {
      key: 'createdAt',
      header: 'Reported At',
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Trust & Safety Reports</h2>
        <p className="text-xs text-slate-400">
          User, job, and messaging safety reports submitted by platform participants.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            id: 'status',
            label: 'Report Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Pending', value: ReportStatus.PENDING },
              { label: 'Under Review', value: ReportStatus.UNDER_REVIEW },
              { label: 'Resolved', value: ReportStatus.RESOLVED },
              { label: 'Dismissed', value: ReportStatus.DISMISSED },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        onReset={() => {
          setStatusFilter('');
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
        data={reports}
        loading={loading}
        emptyMessage="No reports found matching status."
        onRowClick={(r) => setSelectedReport(r)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title="Safety Report Details"
        subtitle={selectedReport ? `ID: ${selectedReport.id}` : ''}
      >
        {selectedReport && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Target Type:</span>
                <span className="font-semibold text-white">{selectedReport.targetType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target ID:</span>
                <span className="font-mono text-slate-200">{selectedReport.targetId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reason:</span>
                <span className="text-rose-400 font-semibold">{selectedReport.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <StatusBadge status={selectedReport.status} type="report" />
              </div>
              {selectedReport.actionTaken && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Action Taken:</span>
                  <span className="text-slate-200">{selectedReport.actionTaken}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

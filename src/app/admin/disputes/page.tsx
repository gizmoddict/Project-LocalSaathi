'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminDisputeItem, DisputeStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { DetailDrawer } from '@/components/admin/DetailDrawer';

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<AdminDisputeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDispute, setSelectedDispute] = useState<AdminDisputeItem | null>(null);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminDisputes({
        page,
        limit,
        status: (statusFilter as DisputeStatus) || undefined,
      });
      setDisputes(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch disputes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [page, statusFilter]);

  const columns: Column<AdminDisputeItem>[] = [
    {
      key: 'bookingId',
      header: 'Booking & Initiator',
      render: (d) => (
        <div>
          <span className="font-semibold text-slate-100">Booking: {d.bookingId.slice(0, 8)}...</span>
          <div className="text-[10px] text-slate-400 font-mono">Raised By: {d.raisedById.slice(0, 8)}...</div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Dispute Reason',
      render: (d) => <span className="font-medium text-amber-300">{d.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <StatusBadge status={d.status} type="dispute" />,
    },
    {
      key: 'createdAt',
      header: 'Raised At',
      render: (d) => new Date(d.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Disputes Queue</h2>
        <p className="text-xs text-slate-400">
          Booking and contract disputes requiring mediation or administrative settlement.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            id: 'status',
            label: 'Dispute Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Open', value: DisputeStatus.OPEN },
              { label: 'Under Review', value: DisputeStatus.UNDER_REVIEW },
              { label: 'Resolved', value: DisputeStatus.RESOLVED },
              { label: 'Closed', value: DisputeStatus.CLOSED },
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
        data={disputes}
        loading={loading}
        emptyMessage="No disputes found matching status."
        onRowClick={(d) => setSelectedDispute(d)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedDispute}
        onClose={() => setSelectedDispute(null)}
        title="Dispute Details"
        subtitle={selectedDispute ? `ID: ${selectedDispute.id}` : ''}
      >
        {selectedDispute && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Dispute ID:</span>
                <span className="font-mono text-white">{selectedDispute.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Booking ID:</span>
                <span className="font-mono text-slate-200">{selectedDispute.bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reason:</span>
                <span className="text-amber-400 font-semibold">{selectedDispute.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <StatusBadge status={selectedDispute.status} type="dispute" />
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

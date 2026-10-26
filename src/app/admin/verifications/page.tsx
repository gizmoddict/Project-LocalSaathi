'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminVerificationItem, VerificationStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { ShieldAlert } from 'lucide-react';

export default function AdminVerificationsPage() {
  const [items, setItems] = useState<AdminVerificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedVerification, setSelectedVerification] = useState<AdminVerificationItem | null>(null);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminVerifications({
        page,
        limit,
        status: (statusFilter as VerificationStatus) || undefined,
      });
      setItems(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch verification documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerifications();
  }, [page, statusFilter]);

  const columns: Column<AdminVerificationItem>[] = [
    {
      key: 'verificationType',
      header: 'Verification Type & User',
      render: (v) => (
        <div>
          <span className="font-semibold text-slate-100">{v.verificationType}</span>
          <div className="text-[10px] text-slate-400">Phone: {v.userPhone}</div>
          <div className="text-[10px] text-slate-500 font-mono">User: {v.userId.slice(0, 8)}...</div>
        </div>
      ),
    },
    {
      key: 'userRole',
      header: 'User Role',
      render: (v) => <StatusBadge status={v.userRole} type="role" />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => <StatusBadge status={v.status} type="verification" />,
    },
    {
      key: 'submittedAt',
      header: 'Submitted At',
      render: (v) => new Date(v.submittedAt).toLocaleString(),
    },
    {
      key: 'reviewedAt',
      header: 'Reviewed At',
      render: (v) => (v.reviewedAt ? new Date(v.reviewedAt).toLocaleDateString() : '—'),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Identity Verifications Queue</h2>
        <p className="text-xs text-slate-400">
          Worker and employer government document verifications with data-minimized metadata.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            id: 'status',
            label: 'Verification Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Pending', value: VerificationStatus.PENDING },
              { label: 'Under Review', value: VerificationStatus.UNDER_REVIEW },
              { label: 'Verified', value: VerificationStatus.VERIFIED },
              { label: 'Rejected', value: VerificationStatus.REJECTED },
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
        data={items}
        loading={loading}
        emptyMessage="No verifications found matching criteria."
        onRowClick={(v) => setSelectedVerification(v)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedVerification}
        onClose={() => setSelectedVerification(null)}
        title="Document Verification Record"
        subtitle={selectedVerification ? `ID: ${selectedVerification.id}` : ''}
      >
        {selectedVerification && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Verification Type:</span>
                <span className="font-semibold text-white">{selectedVerification.verificationType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <StatusBadge status={selectedVerification.status} type="verification" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">User Phone:</span>
                <span className="text-slate-200">{selectedVerification.userPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Submitted:</span>
                <span className="text-slate-200">{new Date(selectedVerification.submittedAt).toLocaleString()}</span>
              </div>
              {selectedVerification.rejectionReason && (
                <div className="p-2 bg-rose-950/40 border border-rose-800 rounded text-rose-300 mt-2">
                  <span className="font-semibold block">Rejection Reason:</span>
                  {selectedVerification.rejectionReason}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <span className="font-semibold text-slate-300 block">Uploaded Document Files:</span>
              {selectedVerification.documents && selectedVerification.documents.length > 0 ? (
                selectedVerification.documents.map((doc) => (
                  <div key={doc.id} className="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-slate-200">{doc.type}</div>
                      <div className="text-[10px] text-slate-400">{doc.mimeType} · {(doc.fileSizeBytes / 1024).toFixed(0)} KB</div>
                    </div>
                    <StatusBadge status={doc.verificationStatus} type="verification" />
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-[11px]">No separate document attachments recorded</div>
              )}
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 space-y-1 leading-relaxed">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Zero Permanent URL Exposure</span>
              </div>
              <p>
                Permanent document storage links are never delivered to the client to guard identity materials.
              </p>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

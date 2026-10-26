'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminPaymentItem, PaymentStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { ShieldCheck } from 'lucide-react';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentItem | null>(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminPayments({
        page,
        limit,
        status: (statusFilter as PaymentStatus) || undefined,
      });
      setPayments(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch payment ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [page, statusFilter]);

  const columns: Column<AdminPaymentItem>[] = [
    {
      key: 'id',
      header: 'Payment ID / Order',
      render: (p) => (
        <div>
          <span className="font-mono text-slate-100">{p.id.slice(0, 8)}...</span>
          <div className="font-mono text-[10px] text-slate-500">
            Booking: {p.bookingId ? `${p.bookingId.slice(0, 8)}...` : 'N/A'}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => (
        <span className="font-bold text-slate-100">
          ₹{(p.amount / 100).toFixed(2)} {p.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} type="payment" />,
    },
    {
      key: 'payerId',
      header: 'Payer & Payee',
      render: (p) => (
        <div className="text-[10px] text-slate-400 font-mono">
          <div>Payer: {p.payerId.slice(0, 8)}...</div>
          <div>Payee: {p.payeeId ? `${p.payeeId.slice(0, 8)}...` : 'N/A'}</div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (p) => new Date(p.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Payment & Escrow Ledger</h2>
        <p className="text-xs text-slate-400">
          Sanitized financial ledger. Card details, secrets, and signatures are strictly excluded.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            id: 'status',
            label: 'Payment Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Pending / Initiated', value: 'INITIATED' },
              { label: 'Captured', value: 'CAPTURED' },
              { label: 'Refunded', value: 'REFUNDED' },
              { label: 'Failed', value: 'FAILED' },
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
        data={payments}
        loading={loading}
        emptyMessage="No payments found matching status."
        onRowClick={(p) => setSelectedPayment(p)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedPayment}
        onClose={() => setSelectedPayment(null)}
        title="Payment Record"
        subtitle={selectedPayment ? `ID: ${selectedPayment.id}` : ''}
      >
        {selectedPayment && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  ₹{(selectedPayment.amount / 100).toFixed(2)} {selectedPayment.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment Status:</span>
                <StatusBadge status={selectedPayment.status} type="payment" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Booking Reference:</span>
                <span className="font-mono text-slate-200">{selectedPayment.bookingId || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payer User ID:</span>
                <span className="font-mono text-slate-200">{selectedPayment.payerId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payee User ID:</span>
                <span className="font-mono text-slate-200">{selectedPayment.payeeId || 'N/A'}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-emerald-900/60 rounded-lg flex items-center gap-2.5 text-emerald-400">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span className="leading-snug">
                PCI Compliance: Raw payment card data, tokens, and webhook secrets are never recorded in application logs.
              </span>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

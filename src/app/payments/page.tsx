'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { PaymentResponse } from '@localsaathi/types';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundSubmitting, setRefundSubmitting] = useState<string | null>(null);

  const loadPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getMyPayments({ limit: 50 });
      setPayments(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleRefund = async (paymentId: string, amount: number) => {
    const reason = prompt('Enter reason for refund:');
    if (reason === null) return;

    try {
      setRefundSubmitting(paymentId);
      await apiClient.requestRefund(paymentId, {
        amount,
        reason: reason || 'Customer requested refund',
        idempotencyKey: `rfnd_${paymentId.substring(0, 8)}_${Date.now()}`,
      });
      alert('Refund processed successfully');
      loadPayments();
    } catch (err) {
      alert(`Refund failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRefundSubmitting(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
          <p className="text-sm text-gray-600">Track all your transactions, receipts, and refunds</p>
        </div>
        <button
          onClick={loadPayments}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="py-12 text-center text-gray-500">Loading payment history...</div>
      )}

      {error && (
        <div className="p-4 mb-6 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {!loading && payments.length === 0 && (
        <div className="py-12 text-center bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-500">No payment records found.</p>
        </div>
      )}

      {!loading && payments.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider Ref
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {p.id.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    {p.currency} {p.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'CAPTURED'
                          ? 'bg-green-100 text-green-800'
                          : p.status === 'INITIATED'
                          ? 'bg-blue-100 text-blue-800'
                          : p.status === 'REFUNDED'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {p.providerPaymentId || p.providerOrderId || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {p.status === 'CAPTURED' && (
                      <button
                        onClick={() => handleRefund(p.id, p.amount)}
                        disabled={refundSubmitting === p.id}
                        className="text-xs text-red-600 hover:text-red-900 font-medium"
                      >
                        {refundSubmitting === p.id ? 'Processing...' : 'Request Refund'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { PaymentResponse } from '@localsaathi/types';

interface PaymentButtonProps {
  bookingId: string;
  amount: number;
  currency?: string;
  onPaymentSuccess?: (payment: PaymentResponse) => void;
  onPaymentError?: (error: string) => void;
  disabled?: boolean;
}

export function PaymentButton({
  bookingId,
  amount,
  currency = 'INR',
  onPaymentSuccess,
  onPaymentError,
  disabled = false,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInitiatePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Generate client idempotency key
      const idempotencyKey = `pay_req_${bookingId.substring(0, 8)}_${Date.now()}`;

      const payment = await apiClient.initiatePayment({
        bookingId,
        amount,
        currency,
        idempotencyKey,
      });

      if (onPaymentSuccess) {
        onPaymentSuccess(payment);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment initiation failed';
      setError(msg);
      if (onPaymentError) {
        onPaymentError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-block">
      <button
        onClick={handleInitiatePayment}
        disabled={disabled || loading}
        className={`px-4 py-2 font-medium text-white rounded-lg transition-colors ${
          disabled || loading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
        }`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing...
          </span>
        ) : (
          `Pay ${currency} ${amount.toFixed(2)}`
        )}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

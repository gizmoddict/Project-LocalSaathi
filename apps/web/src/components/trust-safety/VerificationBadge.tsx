'use client';

import React from 'react';

interface VerificationBadgeProps {
  status: 'UNVERIFIED' | 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | string;
  size?: 'sm' | 'md' | 'lg';
}

export function VerificationBadge({ status, size = 'md' }: VerificationBadgeProps) {
  const getBadgeConfig = () => {
    switch (status) {
      case 'VERIFIED':
        return {
          label: 'Verified Saathi',
          bg: 'bg-emerald-100 dark:bg-emerald-950/60',
          text: 'text-emerald-800 dark:text-emerald-300',
          border: 'border-emerald-300 dark:border-emerald-800',
          icon: '✓',
        };
      case 'UNDER_REVIEW':
      case 'PENDING':
        return {
          label: 'Verification Pending',
          bg: 'bg-amber-100 dark:bg-amber-950/60',
          text: 'text-amber-800 dark:text-amber-300',
          border: 'border-amber-300 dark:border-amber-800',
          icon: '⏳',
        };
      case 'REJECTED':
        return {
          label: 'Verification Rejected',
          bg: 'bg-rose-100 dark:bg-rose-950/60',
          text: 'text-rose-800 dark:text-rose-300',
          border: 'border-rose-300 dark:border-rose-800',
          icon: '✕',
        };
      case 'EXPIRED':
        return {
          label: 'Verification Expired',
          bg: 'bg-gray-100 dark:bg-gray-900',
          text: 'text-gray-700 dark:text-gray-300',
          border: 'border-gray-300 dark:border-gray-700',
          icon: '!',
        };
      case 'UNVERIFIED':
      default:
        return {
          label: 'Unverified',
          bg: 'bg-slate-100 dark:bg-slate-900',
          text: 'text-slate-600 dark:text-slate-400',
          border: 'border-slate-300 dark:border-slate-700',
          icon: '○',
        };
    }
  };

  const config = getBadgeConfig();
  const sizeClass =
    size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : size === 'lg'
        ? 'text-sm px-3 py-1 font-semibold'
        : 'text-xs px-2.5 py-1 font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClass}`}
      title={`Account Trust Status: ${config.label}`}
    >
      <span className="font-bold">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

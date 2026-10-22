'use client';

import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'user' | 'job' | 'payment' | 'verification' | 'dispute' | 'report' | 'priority' | 'role';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = (status || '').toUpperCase();

  const getStyle = () => {
    switch (normalized) {
      // User / Account Status
      case 'ACTIVE':
      case 'COMPLETED':
      case 'CAPTURED':
      case 'VERIFIED':
      case 'APPROVED':
      case 'RESOLVED':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60';

      case 'PENDING':
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
      case 'IN_PROGRESS':
      case 'PAUSED':
      case 'INVESTIGATING':
        return 'bg-amber-950/70 text-amber-300 border-amber-700/60';

      case 'SUSPENDED':
      case 'REJECTED':
      case 'FAILED':
      case 'CANCELLED':
      case 'ACTION_TAKEN':
      case 'ESCALATED':
      case 'DISMISSED':
        return 'bg-rose-950/70 text-rose-300 border-rose-700/60';

      case 'REFUNDED':
      case 'SETTLED':
        return 'bg-blue-950/70 text-blue-300 border-blue-700/60';

      // Priorities
      case 'CRITICAL':
      case 'URGENT':
        return 'bg-rose-950/90 text-rose-200 border-rose-600 font-bold';
      case 'HIGH':
        return 'bg-orange-950/70 text-orange-300 border-orange-700/60';
      case 'MEDIUM':
        return 'bg-amber-950/60 text-amber-300 border-amber-700/60';
      case 'LOW':
        return 'bg-slate-800 text-slate-300 border-slate-700';

      // Roles
      case 'ADMIN':
        return 'bg-purple-950/80 text-purple-200 border-purple-700 font-bold';
      case 'MODERATOR':
        return 'bg-sky-950/70 text-sky-200 border-sky-700 font-medium';
      case 'SUPPORT':
        return 'bg-indigo-950/70 text-indigo-200 border-indigo-700';
      case 'WORKER':
        return 'bg-teal-950/70 text-teal-200 border-teal-700';
      case 'EMPLOYER':
        return 'bg-blue-950/70 text-blue-200 border-blue-700';

      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border tracking-wide ${getStyle()}`}
    >
      {normalized}
    </span>
  );
}

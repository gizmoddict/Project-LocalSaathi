'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: string;
    positive?: boolean;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'purple';
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
}: MetricCardProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'border-emerald-500/20 bg-emerald-950/10 text-emerald-400';
      case 'warning':
        return 'border-amber-500/20 bg-amber-950/10 text-amber-400';
      case 'danger':
        return 'border-rose-500/20 bg-rose-950/10 text-rose-400';
      case 'purple':
        return 'border-purple-500/20 bg-purple-950/10 text-purple-400';
      default:
        return 'border-slate-800 bg-slate-900/60 text-slate-400';
    }
  };

  return (
    <div className={`p-5 rounded-xl border backdrop-blur-sm transition-all ${getVariantStyles()}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        {Icon && <Icon className="w-5 h-5 shrink-0 opacity-80" />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
        {trend && (
          <span
            className={`text-xs font-semibold ${
              trend.positive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {trend.positive ? '+' : ''}
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
}

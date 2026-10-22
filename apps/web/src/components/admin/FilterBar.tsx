'use client';

import React from 'react';
import { Search, RotateCcw } from 'lucide-react';

export interface FilterOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  search?: string;
  searchPlaceholder?: string;
  onSearchChange?: (val: string) => void;
  filters?: {
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (val: string) => void;
  }[];
  onReset?: () => void;
  loading?: boolean;
}

export function FilterBar({
  search,
  searchPlaceholder = 'Search...',
  onSearchChange,
  filters = [],
  onReset,
  loading = false,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900/60 border border-slate-800 rounded-xl mb-4">
      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>
        )}

        {filters.map((f) => (
          <div key={f.id} className="flex items-center gap-1.5">
            <label className="text-xs text-slate-400 font-medium">{f.label}:</label>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {onReset && (
        <button
          onClick={onReset}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Filters</span>
        </button>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { ProductAnalyticsDashboardData } from '@localsaathi/types';
import { MetricCard } from '@/components/admin/MetricCard';
import {
  TrendingUp,
  Users,
  Activity,
  RotateCcw,
  CreditCard,
  Mic,
  Languages,
  Search,
} from 'lucide-react';

export default function AdminAnalyticsPage() {
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalyticsDashboardData | null>(null);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const prodData = await apiClient.getProductAnalyticsMetrics(timeframe);
      setProductAnalytics(prodData);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeframe]);

  return (
    <div className="space-y-6">
      {/* Header with Title, Explorer Link & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Platform & Product Analytics</h2>
          <p className="text-xs text-slate-400 mt-1">
            Canonical telemetry, acquisition funnels, voice search usage, payment liquidity, and event exploration.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Timeframe Selector */}
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          {/* Event Explorer Link */}
          <Link
            href="/admin/analytics/events"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Event Explorer</span>
          </Link>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-800 bg-rose-950/50 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Telemetry Users"
          value={productAnalytics?.acquisition?.uniqueActiveUsers ?? '-'}
          subtitle={`Signups: ${productAnalytics?.acquisition?.signupCompletedCount ?? 0} (${productAnalytics?.acquisition?.signupConversionRate ?? 0}% conv)`}
          icon={Users}
          variant="purple"
        />
        <MetricCard
          title="Application Conversion"
          value={productAnalytics ? `${productAnalytics.matching?.applicationConversionRate ?? 0}%` : '-'}
          subtitle={`Hires: ${productAnalytics?.matching?.applicationsAcceptedCount ?? 0} / Apps: ${productAnalytics?.matching?.applicationsSubmittedCount ?? 0}`}
          icon={TrendingUp}
          variant="success"
        />
        <MetricCard
          title="Booking Completion Rate"
          value={productAnalytics ? `${productAnalytics.fulfillment?.bookingCompletionRate ?? 0}%` : '-'}
          subtitle={`Completed: ${productAnalytics?.fulfillment?.bookingsCompletedCount ?? 0} / Accepted: ${productAnalytics?.fulfillment?.bookingsAcceptedCount ?? 0}`}
          icon={Activity}
          variant="default"
        />
        <MetricCard
          title="Voice Search Telemetry"
          value={productAnalytics?.engagement?.voiceSearchesCount ?? 0}
          subtitle={`${productAnalytics?.engagement?.voiceUsagePercentage ?? 0}% of all searches`}
          icon={Mic}
          variant="warning"
        />
      </div>

      {/* Domain Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 1. Engagement & Voice Telemetry */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-400" />
              <span>Voice & Discovery</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">Product Events</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Total Telemetry Interactions:</span>
              <span className="font-semibold text-slate-200">{productAnalytics?.engagement?.totalInteractions ?? 0}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Job Views Count:</span>
              <span className="font-semibold text-slate-200">{productAnalytics?.engagement?.jobViewsCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Search Queries Performed:</span>
              <span className="font-semibold text-slate-200">{productAnalytics?.engagement?.searchesCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Recommendation CTR:</span>
              <span className="font-semibold text-emerald-400">{productAnalytics?.engagement?.recommendationCtr ?? 0}%</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Voice Search Queries:</span>
              <span className="font-semibold text-amber-400">{productAnalytics?.engagement?.voiceSearchesCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* 2. Language & Localization Telemetry */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Languages className="w-4 h-4 text-cyan-400" />
              <span>Language Preference</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">Telemetry</span>
          </div>
          <div className="space-y-3 text-xs">
            {productAnalytics?.engagement?.topLanguages?.map((lang) => (
              <div key={lang.language} className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400 uppercase font-mono">{lang.language}:</span>
                <span className="font-semibold text-slate-200">{lang.count} switch events</span>
              </div>
            )) || (
              <p className="text-slate-500 text-xs">No language telemetry captured yet.</p>
            )}
          </div>
        </div>

        {/* 3. Payments & Financial Telemetry */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span>Payments & Settlements</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">Financials</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Captured Volume:</span>
              <span className="font-semibold text-emerald-400">
                ₹{((productAnalytics?.payments?.totalCapturedVolumeInr ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Payment Success Rate:</span>
              <span className="font-semibold text-slate-200">{productAnalytics?.payments?.paymentSuccessRate ?? 100}%</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Payment Intents Created:</span>
              <span className="font-semibold text-slate-200">{productAnalytics?.payments?.paymentIntentsCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Payments Captured:</span>
              <span className="font-semibold text-emerald-400">{productAnalytics?.payments?.paymentCapturedCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Payments Failed:</span>
              <span className="font-semibold text-rose-400">{productAnalytics?.payments?.paymentFailedCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

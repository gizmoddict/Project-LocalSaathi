'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import {
  AnalyticsEventRecord,
  AnalyticsEventSource,
} from '@localsaathi/types';
import {
  Filter,
  ArrowLeft,
  RotateCcw,
  X,
  Code,
} from 'lucide-react';

export default function AnalyticsEventExplorerPage() {
  const [events, setEvents] = useState<AnalyticsEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEventRecord | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminAnalyticsEvents({
        page,
        limit,
        eventName: eventNameFilter || undefined,
        source: (sourceFilter as AnalyticsEventSource) || undefined,
        platform: platformFilter || undefined,
      });
      setEvents(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch analytics events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [page, sourceFilter]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEvents();
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Analytics Dashboard</span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-white">Analytics Event Explorer</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time audit & telemetry records across Server Authoritative and Client Interaction events.
          </p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-800 bg-rose-950/50 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <form onSubmit={handleFilterSubmit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Filter by event_name (e.g. job_viewed)..."
            value={eventNameFilter}
            onChange={(e) => setEventNameFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div className="w-48">
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="">All Sources</option>
            <option value="SERVER_AUTHORITATIVE">SERVER_AUTHORITATIVE</option>
            <option value="CLIENT_INTERACTION">CLIENT_INTERACTION</option>
          </select>
        </div>
        <div className="w-36">
          <input
            type="text"
            placeholder="Platform..."
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filter</span>
        </button>
      </form>

      {/* Events Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Event Name</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">Occurred At</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading analytics events...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No analytics events found matching filter criteria.
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-100">
                      {evt.eventName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          evt.source === 'SERVER_AUTHORITATIVE'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60'
                        }`}
                      >
                        {evt.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 uppercase text-[11px] font-mono text-slate-400">
                      {evt.platform}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {evt.userId ? `${evt.userId.substring(0, 8)}...` : <span className="text-slate-600">Anonymous</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {new Date(evt.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(evt)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition-colors"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
          <div>
            Showing {events.length} of {total} event(s)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1 bg-slate-950 border border-slate-800 rounded disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1 bg-slate-950 border border-slate-800 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Event Detail Modal / Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white font-mono">
                  {selectedEvent.eventName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono">
                <div>
                  <span className="text-slate-500 block">Event ID:</span>
                  <span className="text-slate-200">{selectedEvent.eventId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Source:</span>
                  <span className="text-slate-200">{selectedEvent.source}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Occurred At:</span>
                  <span className="text-slate-200">{selectedEvent.occurredAt}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Ingested At:</span>
                  <span className="text-slate-200">{selectedEvent.ingestedAt}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Platform / Version:</span>
                  <span className="text-slate-200">{selectedEvent.platform} (v{selectedEvent.appVersion})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Correlation ID:</span>
                  <span className="text-slate-200">{selectedEvent.correlationId || '-'}</span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-300 block mb-1">Sanitized Metadata:</span>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-indigo-300 font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

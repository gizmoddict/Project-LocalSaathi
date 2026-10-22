'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminWorkerItem } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { Star, MapPin } from 'lucide-react';

export default function AdminWorkersPage() {
  const [workers, setWorkers] = useState<AdminWorkerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedWorker, setSelectedWorker] = useState<AdminWorkerItem | null>(null);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminWorkers({
        page,
        limit,
        search: search.trim() || undefined,
        skill: skillFilter || undefined,
        city: cityFilter || undefined,
      });
      setWorkers(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch workers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, [page, skillFilter, cityFilter]);

  const columns: Column<AdminWorkerItem>[] = [
    {
      key: 'displayName',
      header: 'Worker Profile',
      render: (w) => (
        <div>
          <span className="font-semibold text-slate-100">{w.displayName}</span>
          <div className="text-[10px] text-slate-400 font-mono">{w.userId}</div>
        </div>
      ),
    },
    {
      key: 'skills',
      header: 'Primary Skills',
      render: (w) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {w.skills && w.skills.length > 0 ? (
            w.skills.map((s: string) => (
              <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                {s}
              </span>
            ))
          ) : (
            <span className="text-slate-500 text-[10px]">None listed</span>
          )}
        </div>
      ),
    },
    {
      key: 'city',
      header: 'Location',
      render: (w) => (
        <div className="flex items-center gap-1 text-slate-300">
          <MapPin className="w-3 h-3 text-slate-500" />
          <span>{w.city || w.locality || 'Not set'}</span>
        </div>
      ),
    },
    {
      key: 'avgRating',
      header: 'Rating / Reviews',
      render: (w) => (
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="font-semibold text-slate-200">
            {w.avgRating != null ? Number(w.avgRating).toFixed(1) : 'New'}
          </span>
          <span className="text-slate-500 text-[10px]">({w.ratingCount ?? 0})</span>
        </div>
      ),
    },
    {
      key: 'verificationStatus',
      header: 'Verification',
      render: (w) => (
        <StatusBadge
          status={w.verificationStatus}
          type="verification"
        />
      ),
    },
    {
      key: 'isAvailable',
      header: 'Availability',
      render: (w) => (
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            w.isAvailable ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
          title={w.isAvailable ? 'Available' : 'Unavailable'}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Workers Directory</h2>
        <p className="text-xs text-slate-400">
          Directory of registered workers, verification states, and ratings.
        </p>
      </div>

      <FilterBar
        search={search}
        searchPlaceholder="Search worker name or skill..."
        onSearchChange={setSearch}
        filters={[
          {
            id: 'skill',
            label: 'Skill',
            value: skillFilter,
            options: [
              { label: 'All Skills', value: '' },
              { label: 'Plumbing', value: 'Plumbing' },
              { label: 'Electrical', value: 'Electrical' },
              { label: 'Carpentry', value: 'Carpentry' },
              { label: 'Painting', value: 'Painting' },
            ],
            onChange: (val) => {
              setSkillFilter(val);
              setPage(1);
            },
          },
        ]}
        onReset={() => {
          setSearch('');
          setSkillFilter('');
          setCityFilter('');
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
        data={workers}
        loading={loading}
        emptyMessage="No workers found matching filters."
        onRowClick={(w) => setSelectedWorker(w)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedWorker}
        onClose={() => setSelectedWorker(null)}
        title="Worker Profile Details"
        subtitle={selectedWorker ? `ID: ${selectedWorker.id}` : ''}
      >
        {selectedWorker && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Worker Name:</span>
                <span className="font-semibold text-white">{selectedWorker.displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">User ID:</span>
                <span className="font-mono text-slate-200">{selectedWorker.userId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">City / Locality:</span>
                <span className="text-slate-200">{selectedWorker.city || selectedWorker.locality || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Availability:</span>
                <span className={selectedWorker.isAvailable ? 'text-emerald-400' : 'text-slate-500'}>
                  {selectedWorker.isAvailable ? 'Available for Hire' : 'Unavailable'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Avg Rating:</span>
                <span className="text-amber-400 font-bold">
                  {selectedWorker.avgRating != null ? Number(selectedWorker.avgRating).toFixed(1) : 'None'} ({selectedWorker.ratingCount ?? 0} reviews)
                </span>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

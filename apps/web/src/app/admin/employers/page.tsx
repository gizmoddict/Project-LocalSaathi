'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminEmployerItem, AccountStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { Briefcase } from 'lucide-react';

export default function AdminEmployersPage() {
  const [employers, setEmployers] = useState<AdminEmployerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEmployer, setSelectedEmployer] = useState<AdminEmployerItem | null>(null);

  const fetchEmployers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminEmployers({
        page,
        limit,
        search: search.trim() || undefined,
        accountStatus: (statusFilter as AccountStatus) || undefined,
      });
      setEmployers(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch employers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployers();
  }, [page, statusFilter]);

  const columns: Column<AdminEmployerItem>[] = [
    {
      key: 'businessName',
      header: 'Employer / Business',
      render: (e) => (
        <div>
          <span className="font-semibold text-slate-100">{e.businessName}</span>
          <div className="text-[10px] text-slate-400 font-mono">
            {e.userId}
          </div>
        </div>
      ),
    },
    {
      key: 'businessType',
      header: 'Establishment Type',
      render: (e) => (
        <span className="text-slate-300">{e.businessType || 'INDIVIDUAL'}</span>
      ),
    },
    {
      key: 'totalJobsPosted',
      header: 'Jobs Posted',
      render: (e) => (
        <div className="flex items-center gap-1.5 text-slate-300">
          <Briefcase className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-semibold">{e.totalJobsPosted ?? 0}</span>
        </div>
      ),
    },
    {
      key: 'verificationStatus',
      header: 'Verification Status',
      render: (e) => (
        <StatusBadge
          status={e.verificationStatus}
          type="verification"
        />
      ),
    },
    {
      key: 'createdAt',
      header: 'Joined Date',
      render: (e) => new Date(e.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Employers Directory</h2>
        <p className="text-xs text-slate-400">
          Directory of registered employers, job activity, and business verifications.
        </p>
      </div>

      <FilterBar
        search={search}
        searchPlaceholder="Search employer or company..."
        onSearchChange={setSearch}
        onReset={() => {
          setSearch('');
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
        data={employers}
        loading={loading}
        emptyMessage="No employers found matching filters."
        onRowClick={(e) => setSelectedEmployer(e)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedEmployer}
        onClose={() => setSelectedEmployer(null)}
        title="Employer Profile Details"
        subtitle={selectedEmployer ? `ID: ${selectedEmployer.id}` : ''}
      >
        {selectedEmployer && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Business / Trade Name:</span>
                <span className="font-semibold text-white">{selectedEmployer.businessName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">User ID:</span>
                <span className="font-mono text-slate-200">{selectedEmployer.userId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Jobs Posted:</span>
                <span className="text-emerald-400 font-semibold">{selectedEmployer.totalJobsPosted ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Hires Made:</span>
                <span className="text-sky-400 font-semibold">{selectedEmployer.totalHires ?? 0}</span>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

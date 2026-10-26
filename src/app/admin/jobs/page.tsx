'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminJobItem, JobStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ConfirmationDialog } from '@/components/admin/ConfirmationDialog';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { PauseCircle, PlayCircle, MapPin, Users } from 'lucide-react';

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedJob, setSelectedJob] = useState<AdminJobItem | null>(null);
  const [actionJob, setActionJob] = useState<AdminJobItem | null>(null);
  const [actionType, setActionType] = useState<'pause' | 'resume' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminJobs({
        page,
        limit,
        search: search.trim() || undefined,
        status: (statusFilter as JobStatus) || undefined,
        category: categoryFilter || undefined,
        city: cityFilter || undefined,
      });
      setJobs(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page, statusFilter, categoryFilter, cityFilter]);

  const handleActionConfirm = async () => {
    if (!actionJob || !actionType) return;
    try {
      setActionLoading(true);
      if (actionType === 'pause') {
        await apiClient.pauseAdminJob(actionJob.id, {
          reason: actionReason || 'Administrative moderation hold',
        });
      } else {
        await apiClient.resumeAdminJob(actionJob.id);
      }
      setActionJob(null);
      setActionType(null);
      setActionReason('');
      fetchJobs();
    } catch (err: any) {
      alert(`Job action failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Column<AdminJobItem>[] = [
    {
      key: 'title',
      header: 'Job Title & Employer',
      render: (j) => (
        <div>
          <span className="font-semibold text-slate-100">{j.title}</span>
          <div className="text-[10px] text-slate-400">
            {j.employerBusinessName || 'Employer'} · {j.category}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusBadge status={j.status} type="job" />,
    },
    {
      key: 'location',
      header: 'Location',
      render: (j) => (
        <div className="flex items-center gap-1 text-slate-300">
          <MapPin className="w-3 h-3 text-slate-500" />
          <span>{j.city || j.locality || 'Unspecified'}</span>
        </div>
      ),
    },
    {
      key: 'wageAmount',
      header: 'Offered Wage',
      render: (j) => (
        <span className="font-medium text-slate-200">
          ₹{j.wageAmount} / {j.wageType?.toLowerCase() || 'day'}
        </span>
      ),
    },
    {
      key: 'applicationsCount',
      header: 'Applications',
      render: (j) => (
        <div className="flex items-center gap-1 text-slate-300">
          <Users className="w-3 h-3 text-slate-500" />
          <span>{j.applicationsCount ?? 0}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (j) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {j.status === JobStatus.PUBLISHED ? (
            <button
              onClick={() => {
                setActionJob(j);
                setActionType('pause');
              }}
              title="Pause Job"
              className="p-1 rounded bg-amber-950/40 text-amber-400 hover:bg-amber-900/60 border border-amber-800 transition-colors"
            >
              <PauseCircle className="w-3.5 h-3.5" />
            </button>
          ) : j.status === JobStatus.PAUSED ? (
            <button
              onClick={() => {
                setActionJob(j);
                setActionType('resume');
              }}
              title="Resume Job"
              className="p-1 rounded bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-800 transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Job Postings Management</h2>
        <p className="text-xs text-slate-400">
          Browse active and past jobs, inspect applications, and apply operational holds.
        </p>
      </div>

      <FilterBar
        search={search}
        searchPlaceholder="Search job title or city..."
        onSearchChange={setSearch}
        filters={[
          {
            id: 'status',
            label: 'Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Published', value: JobStatus.PUBLISHED },
              { label: 'Paused', value: JobStatus.PAUSED },
              { label: 'Filled', value: JobStatus.FILLED },
              { label: 'Completed', value: JobStatus.COMPLETED },
              { label: 'Cancelled', value: JobStatus.CANCELLED },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        onReset={() => {
          setSearch('');
          setStatusFilter('');
          setCategoryFilter('');
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
        data={jobs}
        loading={loading}
        emptyMessage="No job postings found matching criteria."
        onRowClick={(j) => setSelectedJob(j)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title="Job Posting Details"
        subtitle={selectedJob ? `ID: ${selectedJob.id}` : ''}
      >
        {selectedJob && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Title:</span>
                <span className="font-semibold text-white">{selectedJob.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Employer Business:</span>
                <span className="text-slate-200">{selectedJob.employerBusinessName || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <StatusBadge status={selectedJob.status} type="job" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Wage:</span>
                <span className="text-emerald-400 font-semibold">
                  ₹{selectedJob.wageAmount} ({selectedJob.wageType})
                </span>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmationDialog
        isOpen={!!actionJob}
        onClose={() => setActionJob(null)}
        onConfirm={handleActionConfirm}
        title={actionType === 'pause' ? 'Pause Job Posting' : 'Resume Job Posting'}
        description={
          actionType === 'pause'
            ? `Are you sure you want to pause job "${actionJob?.title}"? Workers will no longer be able to discover or apply to it.`
            : `Are you sure you want to resume job "${actionJob?.title}"? It will become discoverable again.`
        }
        confirmLabel={actionType === 'pause' ? 'Pause Job' : 'Resume Job'}
        variant={actionType === 'pause' ? 'warning' : 'primary'}
        loading={actionLoading}
      />
    </div>
  );
}

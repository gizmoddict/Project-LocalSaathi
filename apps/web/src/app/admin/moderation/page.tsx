'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  AdminModerationItem,
  ModerationCaseStatus,
  ModerationPriority,
  ModerationActionType,
} from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ConfirmationDialog } from '@/components/admin/ConfirmationDialog';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { Check, UserCheck } from 'lucide-react';

export default function AdminModerationPage() {
  const [cases, setCases] = useState<AdminModerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCase, setSelectedCase] = useState<AdminModerationItem | null>(null);
  const [actionCase, setActionCase] = useState<AdminModerationItem | null>(null);
  const [actionType, setActionType] = useState<'claim' | 'resolve' | null>(null);
  const [resolutionAction] = useState<ModerationActionType>(ModerationActionType.DISMISS);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCases = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminModeration({
        page,
        limit,
        status: (statusFilter as ModerationCaseStatus) || undefined,
        priority: (priorityFilter as ModerationPriority) || undefined,
      });
      setCases(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch moderation cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [page, statusFilter, priorityFilter]);

  const handleActionConfirm = async () => {
    if (!actionCase || !actionType) return;
    try {
      setActionLoading(true);
      if (actionType === 'claim') {
        await apiClient.claimModerationCaseAdmin(actionCase.id);
      } else {
        await apiClient.resolveModerationCaseAdmin(
          actionCase.id,
          resolutionAction,
          resolutionNote || 'Resolved via Admin Operations Console',
        );
      }
      setActionCase(null);
      setActionType(null);
      setResolutionNote('');
      fetchCases();
    } catch (err: any) {
      alert(`Action failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Column<AdminModerationItem>[] = [
    {
      key: 'caseNumber',
      header: 'Case # & Title',
      render: (c) => (
        <div>
          <span className="font-semibold text-slate-100">{c.caseNumber}</span>
          <div className="text-[10px] text-slate-400">{c.title}</div>
        </div>
      ),
    },
    {
      key: 'caseType',
      header: 'Case Type',
      render: (c) => <span className="font-mono text-slate-300">{c.caseType}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (c) => <StatusBadge status={c.priority} type="priority" />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.status} type="report" />,
    },
    {
      key: 'assignedToId',
      header: 'Assigned Operator',
      render: (c) => (
        <span className="text-slate-300 font-mono text-[11px]">
          {c.assignedToId ? `${c.assignedToId.slice(0, 8)}...` : 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created At',
      render: (c) => new Date(c.createdAt).toLocaleString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {c.status === ModerationCaseStatus.PENDING && (
            <button
              onClick={() => {
                setActionCase(c);
                setActionType('claim');
              }}
              title="Claim Case"
              className="p-1 rounded bg-sky-950/40 text-sky-400 hover:bg-sky-900/60 border border-sky-800 transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
            </button>
          )}
          {c.status !== ModerationCaseStatus.RESOLVED && (
            <button
              onClick={() => {
                setActionCase(c);
                setActionType('resolve');
              }}
              title="Resolve Case"
              className="p-1 rounded bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Trust & Moderation Queue</h2>
        <p className="text-xs text-slate-400">
          Central operations triage queue for safety cases, disputes, and violations.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            id: 'status',
            label: 'Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Pending', value: ModerationCaseStatus.PENDING },
              { label: 'Under Review', value: ModerationCaseStatus.UNDER_REVIEW },
              { label: 'Resolved', value: ModerationCaseStatus.RESOLVED },
              { label: 'Escalated', value: ModerationCaseStatus.ESCALATED },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
          {
            id: 'priority',
            label: 'Priority',
            value: priorityFilter,
            options: [
              { label: 'All Priorities', value: '' },
              { label: 'Critical', value: ModerationPriority.CRITICAL },
              { label: 'High', value: ModerationPriority.HIGH },
              { label: 'Medium', value: ModerationPriority.MEDIUM },
              { label: 'Low', value: ModerationPriority.LOW },
            ],
            onChange: (val) => {
              setPriorityFilter(val);
              setPage(1);
            },
          },
        ]}
        onReset={() => {
          setStatusFilter('');
          setPriorityFilter('');
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
        data={cases}
        loading={loading}
        emptyMessage="No moderation cases currently pending review."
        onRowClick={(c) => setSelectedCase(c)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      <DetailDrawer
        isOpen={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        title="Moderation Case Investigation"
        subtitle={selectedCase ? `Case #${selectedCase.caseNumber}` : ''}
      >
        {selectedCase && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Type:</span>
                <span className="font-semibold text-white">{selectedCase.caseType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Priority:</span>
                <StatusBadge status={selectedCase.priority} type="priority" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <StatusBadge status={selectedCase.status} type="report" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Entity:</span>
                <span className="font-mono text-slate-200">
                  {selectedCase.targetEntityType} ({selectedCase.targetEntityId})
                </span>
              </div>
              {selectedCase.resolution && (
                <div>
                  <span className="text-slate-400 block mb-1">Resolution:</span>
                  <p className="p-2 bg-slate-900 border border-slate-800 rounded text-slate-200">
                    {selectedCase.resolution}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmationDialog
        isOpen={!!actionCase}
        onClose={() => setActionCase(null)}
        onConfirm={handleActionConfirm}
        title={actionType === 'claim' ? 'Claim Moderation Case' : 'Resolve Moderation Case'}
        description={
          actionType === 'claim'
            ? `Claim case #${actionCase?.caseNumber}? It will be assigned to your staff account.`
            : `Resolve case #${actionCase?.caseNumber} with action "${resolutionAction}".`
        }
        confirmLabel={actionType === 'claim' ? 'Claim Case' : 'Resolve Case'}
        variant={actionType === 'claim' ? 'primary' : 'primary'}
        loading={actionLoading}
      />
    </div>
  );
}

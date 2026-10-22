'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminUserItem, UserRole, AccountStatus } from '@localsaathi/types';
import { DataTable, Column } from '@/components/admin/DataTable';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pagination } from '@/components/admin/Pagination';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ConfirmationDialog } from '@/components/admin/ConfirmationDialog';
import { DetailDrawer } from '@/components/admin/DetailDrawer';
import { Ban, CheckCircle } from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected user for inspection & actions
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [actionTarget, setActionTarget] = useState<AdminUserItem | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'reinstate' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAdminUsers({
        page,
        limit,
        search: search.trim() || undefined,
        role: (roleFilter as UserRole) || undefined,
        accountStatus: (statusFilter as AccountStatus) || undefined,
      });
      setUsers(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

  const handleActionConfirm = async () => {
    if (!actionTarget || !actionType) return;
    try {
      setActionLoading(true);
      if (actionType === 'suspend') {
        await apiClient.suspendUserAdmin(actionTarget.id, {
          reason: actionReason || 'Admin administrative suspension',
        });
      } else {
        await apiClient.reinstateUserAdmin(actionTarget.id, {
          reason: actionReason || 'Admin administrative reinstatement',
        });
      }
      setActionTarget(null);
      setActionType(null);
      setActionReason('');
      fetchUsers();
    } catch (err: any) {
      alert(`Action failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Column<AdminUserItem>[] = [
    {
      key: 'phone',
      header: 'Phone / User ID',
      render: (u) => (
        <div>
          <span className="font-semibold text-slate-100">{u.phone}</span>
          <div className="font-mono text-[10px] text-slate-500">{u.id}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <StatusBadge status={u.role} type="role" />,
    },
    {
      key: 'accountStatus',
      header: 'Account Status',
      render: (u) => <StatusBadge status={u.accountStatus} type="user" />,
    },
    {
      key: 'verificationStatus',
      header: 'Verification',
      render: (u) => <StatusBadge status={u.verificationStatus} type="verification" />,
    },
    {
      key: 'createdAt',
      header: 'Joined Date',
      render: (u) => new Date(u.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {u.accountStatus === AccountStatus.ACTIVE ? (
            <button
              onClick={() => {
                setActionTarget(u);
                setActionType('suspend');
              }}
              title="Suspend User"
              className="p-1 rounded bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 border border-rose-800 transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => {
                setActionTarget(u);
                setActionType('reinstate');
              }}
              title="Reinstate User"
              className="p-1 rounded bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-800 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Platform Users</h2>
        <p className="text-xs text-slate-400">Search, inspect, and manage user accounts & role capabilities.</p>
      </div>

      <FilterBar
        search={search}
        searchPlaceholder="Search phone or user ID..."
        onSearchChange={setSearch}
        filters={[
          {
            id: 'role',
            label: 'Role',
            value: roleFilter,
            options: [
              { label: 'All Roles', value: '' },
              { label: 'Worker', value: UserRole.WORKER },
              { label: 'Employer', value: UserRole.EMPLOYER },
              { label: 'Support', value: UserRole.SUPPORT },
              { label: 'Moderator', value: UserRole.MODERATOR },
              { label: 'Admin', value: UserRole.ADMIN },
            ],
            onChange: (val) => {
              setRoleFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: 'Status',
            value: statusFilter,
            options: [
              { label: 'All Statuses', value: '' },
              { label: 'Active', value: AccountStatus.ACTIVE },
              { label: 'Suspended', value: AccountStatus.SUSPENDED },
              { label: 'Pending Verification', value: AccountStatus.PENDING_VERIFICATION },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        onReset={() => {
          setSearch('');
          setRoleFilter('');
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
        data={users}
        loading={loading}
        emptyMessage="No platform users found matching criteria."
        onRowClick={(u) => setSelectedUser(u)}
      />

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
        disabled={loading}
      />

      {/* User Details Drawer */}
      <DetailDrawer
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="User Account Details"
        subtitle={selectedUser ? `ID: ${selectedUser.id}` : ''}
      >
        {selectedUser && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Phone Number:</span>
                <span className="font-semibold text-white">{selectedUser.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Account Role:</span>
                <StatusBadge status={selectedUser.role} type="role" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Account Status:</span>
                <StatusBadge status={selectedUser.accountStatus} type="user" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Verification:</span>
                <StatusBadge status={selectedUser.verificationStatus} type="verification" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Registered:</span>
                <span className="text-slate-200">{new Date(selectedUser.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="font-semibold text-slate-300">Security & Privacy Invariant</div>
              <p className="text-slate-400 leading-relaxed">
                Password hashes, OTP secrets, and active tokens are strictly redacted from admin endpoints.
              </p>
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* Confirmation Dialog for Suspend / Reinstate */}
      <ConfirmationDialog
        isOpen={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={handleActionConfirm}
        title={actionType === 'suspend' ? 'Suspend User Account' : 'Reinstate User Account'}
        description={
          actionType === 'suspend'
            ? `Are you sure you want to suspend user ${actionTarget?.phone}? This will immediately invalidate their sessions and prevent further bookings or applications.`
            : `Are you sure you want to reinstate user ${actionTarget?.phone}? This will restore account access.`
        }
        confirmLabel={actionType === 'suspend' ? 'Suspend User' : 'Reinstate User'}
        variant={actionType === 'suspend' ? 'danger' : 'primary'}
        loading={actionLoading}
      />
    </div>
  );
}

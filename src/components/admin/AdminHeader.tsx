'use client';

import React from 'react';
import { UserRole } from '@localsaathi/types';
import { Shield, Activity, LogOut, User } from 'lucide-react';

interface AdminHeaderProps {
  user?: {
    id?: string;
    phoneNumber?: string;
    role?: UserRole;
  } | null;
  onLogout?: () => void;
}

export function AdminHeader({ user, onLogout }: AdminHeaderProps) {
  const getRoleBadgeColor = (role?: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-900/60 text-purple-200 border-purple-700';
      case UserRole.MODERATOR:
        return 'bg-blue-900/60 text-blue-200 border-blue-700';
      case UserRole.SUPPORT:
        return 'bg-amber-900/60 text-amber-200 border-amber-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between text-slate-100">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-200 hidden md:block">
          Operations & Governance Console
        </h1>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
          <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span>PostgreSQL · Redis OK</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className="font-medium text-slate-200">{user.phoneNumber || 'Staff User'}</div>
              <span
                className={`inline-block px-2 py-0.5 mt-0.5 rounded text-[10px] font-semibold border ${getRoleBadgeColor(
                  user.role,
                )}`}
              >
                {user.role || 'STAFF'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <User className="w-4 h-4" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Admin Session Active</span>
          </div>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            title="Log out"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}

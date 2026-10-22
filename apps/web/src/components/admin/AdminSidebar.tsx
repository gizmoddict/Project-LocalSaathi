'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Building2,
  FileText,
  AlertTriangle,
  Scale,
  CreditCard,
  CheckCircle2,
  ShieldAlert,
  BarChart3,
  Activity,
  History,
} from 'lucide-react';

export const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/workers', label: 'Workers', icon: Briefcase },
  { href: '/admin/employers', label: 'Employers', icon: Building2 },
  { href: '/admin/jobs', label: 'Jobs', icon: FileText },
  { href: '/admin/reports', label: 'Reports', icon: AlertTriangle },
  { href: '/admin/disputes', label: 'Disputes', icon: Scale },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/verifications', label: 'Verifications', icon: CheckCircle2 },
  { href: '/admin/moderation', label: 'Moderation Queue', icon: ShieldAlert },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/system-health', label: 'System Health', icon: Activity },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: History },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shrink-0 min-h-screen">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2 font-bold text-lg text-emerald-400">
          <ShieldAlert className="w-6 h-6 text-emerald-400" />
          <span>LocalSaathi Ops</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Operations
        </div>
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>Environment</span>
          <span className="text-emerald-400 font-mono">Production</span>
        </div>
        <div className="mt-1 text-slate-500">LocalSaathi Phase 15</div>
      </div>
    </aside>
  );
}

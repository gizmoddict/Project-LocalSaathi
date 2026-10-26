'use client';

import React from 'react';

export type FilterCategory = 'ALL' | 'UNREAD' | 'APPLICATION' | 'BOOKING' | 'MESSAGE' | 'JOB';

interface NotificationFiltersProps {
  activeFilter: FilterCategory;
  onFilterChange: (filter: FilterCategory) => void;
  unreadCount: number;
}

export function NotificationFilters({
  activeFilter,
  onFilterChange,
  unreadCount,
}: NotificationFiltersProps) {
  const tabs: Array<{ id: FilterCategory; label: string; badge?: number }> = [
    { id: 'ALL', label: 'All Notifications' },
    { id: 'UNREAD', label: 'Unread', badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'APPLICATION', label: 'Applications' },
    { id: 'BOOKING', label: 'Bookings & Contracts' },
    { id: 'MESSAGE', label: 'Messages' },
    { id: 'JOB', label: 'Jobs' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Notification categories"
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '8px',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '16px',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeFilter === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onFilterChange(tab.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: isActive ? '1px solid #4f46e5' : '1px solid #d1d5db',
              background: isActive ? '#eef2ff' : '#ffffff',
              color: isActive ? '#4338ca' : '#4b5563',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                style={{
                  background: isActive ? '#4f46e5' : '#ef4444',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

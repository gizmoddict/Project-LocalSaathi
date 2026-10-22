'use client';

import React from 'react';
import { NotificationItem } from '@localsaathi/types';

interface NotificationItemProps {
  notification: NotificationItem;
  onMarkRead?: (id: string) => void;
}

/**
 * NotificationItem — renders a single notification row.
 * Used inside NotificationBell dropdown and full notification page.
 */
export function NotificationItemCard({ notification: n, onMarkRead }: NotificationItemProps) {
  return (
    <div
      role="listitem"
      aria-label={n.title}
      onClick={() => { if (!n.isRead && onMarkRead) onMarkRead(n.id); }}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f9fafb',
        cursor: n.isRead ? 'default' : 'pointer',
        background: n.isRead ? '#fff' : '#f0f9ff',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
      }}
    >
      {/* Priority / unread indicator */}
      <span
        aria-hidden="true"
        style={{
          minWidth: '8px',
          height: '8px',
          borderRadius: '50%',
          background: n.isRead
            ? 'transparent'
            : n.priority === 'HIGH'
            ? '#ef4444'
            : '#6366f1',
          marginTop: '5px',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: n.isRead ? 400 : 600,
            fontSize: '13px',
            color: '#111827',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {n.title}
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          {n.body}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
          {new Date(n.createdAt).toLocaleString()}
          {!n.isRead && (
            <span
              style={{
                marginLeft: '8px',
                color: '#6366f1',
                fontWeight: 600,
              }}
            >
              • New
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

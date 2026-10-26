'use client';

import React from 'react';
import { NotificationItem } from '@localsaathi/types';

interface NotificationListProps {
  notifications: NotificationItem[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NotificationList({
  notifications,
  isLoading,
  onMarkRead,
  onDelete,
}: NotificationListProps) {
  if (isLoading && notifications.length === 0) {
    return (
      <div
        style={{
          padding: '48px 16px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '14px',
        }}
      >
        Loading notifications...
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div
        style={{
          padding: '64px 16px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔔</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
          No notifications yet
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          When you receive updates about applications, bookings, or messages, they will appear here.
        </div>
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label="Notification list"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      {notifications.map((n) => {
        const isHigh = n.priority === 'HIGH';
        return (
          <div
            key={n.id}
            role="listitem"
            style={{
              padding: '16px',
              borderBottom: '1px solid #f3f4f6',
              background: n.isRead ? '#ffffff' : '#f8faff',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              transition: 'background 0.15s ease',
            }}
          >
            {/* Unread indicator */}
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: n.isRead ? '#e5e7eb' : isHigh ? '#ef4444' : '#4f46e5',
                marginTop: '5px',
                flexShrink: 0,
              }}
              title={n.isRead ? 'Read' : 'Unread'}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: n.isRead ? 500 : 700,
                    color: '#111827',
                  }}
                >
                  {n.title}
                </span>

                {isHigh && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#b91c1c',
                      background: '#fee2e2',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    High Priority
                  </span>
                )}

                <span
                  style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    background: '#f3f4f6',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {n.type}
                </span>
              </div>

              <div
                style={{
                  fontSize: '13px',
                  color: '#4b5563',
                  marginTop: '4px',
                  lineHeight: '1.4',
                }}
              >
                {n.body}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span>{new Date(n.createdAt).toLocaleString()}</span>
                {n.expiresAt && (
                  <span>
                    Expires: {new Date(n.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => onMarkRead(n.id)}
                  title="Mark as read"
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#4f46e5',
                    background: '#eef2ff',
                    border: '1px solid #c7d2fe',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Mark read
                </button>
              )}

              <button
                type="button"
                onClick={() => onDelete(n.id)}
                title="Delete notification"
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#ef4444',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

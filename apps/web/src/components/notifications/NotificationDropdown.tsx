'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { NotificationListResponse, NotificationItem } from '@localsaathi/types';
import { NotificationItemCard } from './NotificationItem';

interface NotificationDropdownProps {
  token: string | null;
  apiBase?: string;
  onUnreadCountChange?: (count: number) => void;
}

/**
 * NotificationDropdown — full paginated notification list panel.
 * Suitable for a dedicated /notifications page.
 */
export function NotificationDropdown({ token, apiBase, onUnreadCountChange }: NotificationDropdownProps) {
  const base = apiBase ?? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1');
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const hdrs = useCallback(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const fetchPage = useCallback(
    async (p: number) => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(`${base}/notifications?page=${p}&limit=20`, {
          headers: hdrs(),
        });
        if (res.ok) {
          const json = await res.json();
          const result: NotificationListResponse = json?.data ?? json;
          setData(result);
          onUnreadCountChange?.(result.unreadCount);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [base, token, hdrs, onUnreadCountChange]
  );

  useEffect(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!token) return;
      try {
        await fetch(`${base}/notifications/${notificationId}/read`, {
          method: 'PATCH',
          headers: hdrs(),
        });
        setData((prev) => {
          if (!prev) return prev;
          const updated = prev.notifications.map((n: NotificationItem) =>
            n.id === notificationId ? { ...n, isRead: true } : n
          );
          const newUnread = Math.max(0, prev.unreadCount - 1);
          onUnreadCountChange?.(newUnread);
          return { ...prev, notifications: updated, unreadCount: newUnread };
        });
      } catch {
        // silent
      }
    },
    [base, token, hdrs, onUnreadCountChange]
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await fetch(`${base}/notifications/read-all`, {
        method: 'POST',
        headers: hdrs(),
      });
      setData((prev) => {
        if (!prev) return prev;
        onUnreadCountChange?.(0);
        return {
          ...prev,
          notifications: prev.notifications.map((n: NotificationItem) => ({
            ...n,
            isRead: true,
          })),
          unreadCount: 0,
        };
      });
    } catch {
      // silent
    }
  }, [base, token, hdrs, onUnreadCountChange]);

  if (!token) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
        Please log in to view notifications.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 0',
          borderBottom: '2px solid #f3f4f6',
          marginBottom: '8px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
          Notifications
          {(data?.unreadCount ?? 0) > 0 && (
            <span
              style={{
                marginLeft: '8px',
                background: '#6366f1',
                color: '#fff',
                borderRadius: '12px',
                fontSize: '12px',
                padding: '2px 8px',
                fontWeight: 600,
              }}
            >
              {data!.unreadCount} unread
            </span>
          )}
        </h2>
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            onClick={markAllRead}
            style={{
              background: 'none',
              border: '1px solid #6366f1',
              color: '#6366f1',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          Loading notifications…
        </div>
      ) : !data || data.notifications.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          You have no notifications yet.
        </div>
      ) : (
        <>
          <div role="list" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            {data.notifications.map((n: NotificationItem) => (
              <NotificationItemCard key={n.id} notification={n} onMarkRead={markRead} />
            ))}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {data.total} total · page {data.page} of {Math.ceil(data.total / data.limit)}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  background: '#fff',
                  fontSize: '13px',
                  opacity: page <= 1 ? 0.5 : 1,
                }}
              >
                ← Prev
              </button>
              <button
                disabled={!data.hasMore}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: !data.hasMore ? 'not-allowed' : 'pointer',
                  background: '#fff',
                  fontSize: '13px',
                  opacity: !data.hasMore ? 0.5 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

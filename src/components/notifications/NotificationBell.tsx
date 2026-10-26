'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { NotificationItem, NotificationListResponse } from '@localsaathi/types';
import { useTranslation } from '@/i18n/context';

interface NotificationBellProps {
  /** JWT token for API calls and WebSocket authentication */
  token: string | null;
  /** API base URL, defaults to NEXT_PUBLIC_API_URL */
  apiBase?: string;
  /** WebSocket URL, defaults to NEXT_PUBLIC_WS_URL or origin of apiBase */
  wsUrl?: string;
}

const MAX_DROPDOWN_ITEMS = 8;

/**
 * NotificationBell — shows the bell icon with an unread count badge.
 * Clicking opens/closes a dropdown of recent notifications.
 *
 * Real-time capabilities:
 *  - Connects to Socket.IO namespace `/notifications` with JWT bearer auth.
 *  - On `notification.created`: prepends notification & increments unread count.
 *  - On `notification.count_updated`: synchronizes unread count.
 *  - On reconnect: queries REST API to backfill any missed events.
 *  - Fallback: continues 60s background polling if socket disconnects.
 */
export function NotificationBell({ token, apiBase, wsUrl }: NotificationBellProps) {
  const { t } = useTranslation();
  const base = apiBase ?? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1');
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const headers = useCallback(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${base}/notifications/unread-count`, { headers: headers() });
      if (res.ok) {
        const json = await res.json();
        const count = json?.data?.unreadCount ?? json?.unreadCount ?? 0;
        setUnreadCount(count);
      }
    } catch {
      // silent — bell count errors are non-critical
    }
  }, [base, token, headers]);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${base}/notifications?limit=${MAX_DROPDOWN_ITEMS}`,
        { headers: headers() }
      );
      if (res.ok) {
        const json = await res.json();
        const data: NotificationListResponse = json?.data ?? json;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [base, token, headers]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!token) return;
      try {
        await fetch(`${base}/notifications/${notificationId}/read`, {
          method: 'PATCH',
          headers: headers(),
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // silent
      }
    },
    [base, token, headers]
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await fetch(`${base}/notifications/read-all`, {
        method: 'POST',
        headers: headers(),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, [base, token, headers]);

  // Derive Socket.IO host URL
  const getSocketHost = useCallback(() => {
    if (wsUrl) return wsUrl;
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    try {
      const parsed = new URL(base);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return 'http://localhost:4000';
    }
  }, [base, wsUrl]);

  // Real-time WebSocket connection lifecycle
  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const host = getSocketHost();
    const socket = io(`${host}/notifications`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // Re-synchronize on connection or reconnection to capture any missed events
      fetchUnreadCount();
      if (open) {
        fetchNotifications();
      }
    });

    socket.on('notification.created', (newNotification: NotificationItem) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotification.id)) return prev;
        return [newNotification, ...prev.slice(0, MAX_DROPDOWN_ITEMS - 1)];
      });
      setUnreadCount((c) => c + 1);
    });

    socket.on('notification.count_updated', (data: { unreadCount: number }) => {
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    });

    socket.on('notification.read', (data: { notificationId: string }) => {
      if (data?.notificationId) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === data.notificationId ? { ...n, isRead: true } : n))
        );
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, getSocketHost, fetchUnreadCount, fetchNotifications, open]);

  // Initial count fetch + 60s fallback polling
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch list when dropdown opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!token) return null;

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Bell SVG */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '18px',
              height: '18px',
              borderRadius: '9px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            width: '360px',
            maxHeight: '480px',
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#6366f1',
                  fontWeight: 500,
                }}
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Body */}
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
              {t('common.loading')}
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
              {t('notifications.emptyNotifications')}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => { if (!n.isRead) markRead(n.id); }}
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
                  {/* Unread dot */}
                  <span
                    style={{
                      minWidth: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: n.isRead ? 'transparent' : '#6366f1',
                      marginTop: '5px',
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: '13px', color: '#111827' }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {n.body}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

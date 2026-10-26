'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../../lib/api-client';
import {
  NotificationItem,
  NotificationPreferenceResponse,
} from '@localsaathi/types';
import {
  NotificationFilters,
  FilterCategory,
} from '../../components/notifications/NotificationFilters';
import { NotificationList } from '../../components/notifications/NotificationList';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from '@/i18n/context';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showPreferences, setShowPreferences] = useState<boolean>(false);
  const [preferences, setPreferences] =
    useState<NotificationPreferenceResponse | null>(null);
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const query: {
        page: number;
        limit: number;
        unreadOnly?: boolean;
        type?: string;
      } = {
        page,
        limit,
      };

      if (activeFilter === 'UNREAD') {
        query.unreadOnly = true;
      }

      const res = await apiClient.getNotifications(query);
      let filtered = res.notifications;

      if (activeFilter === 'APPLICATION') {
        filtered = filtered.filter((n) => n.type.startsWith('APPLICATION_'));
      } else if (activeFilter === 'BOOKING') {
        filtered = filtered.filter((n) => n.type.startsWith('BOOKING_'));
      } else if (activeFilter === 'MESSAGE') {
        filtered = filtered.filter(
          (n) => n.type.startsWith('MESSAGE_') || n.type === 'CONVERSATION_CREATED'
        );
      } else if (activeFilter === 'JOB') {
        filtered = filtered.filter((n) => n.type.startsWith('JOB_'));
      }

      setNotifications(filtered);
      setTotal(res.total);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, activeFilter]);

  const fetchPreferences = async () => {
    try {
      const res = await apiClient.getNotificationPreferences();
      setPreferences(res);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time Socket.IO setup
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return;

    const wsUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    let socket: Socket | null = null;

    try {
      socket = io(`${wsUrl}/notifications`, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      const handleNewNotification = (data: any) => {
        const item: NotificationItem = data.notification || data;
        setNotifications((prev) => [item, ...prev]);
        setUnreadCount((prev) => (data.unreadCount !== undefined ? data.unreadCount : prev + 1));
      };

      const handleRead = (data: any) => {
        if (data.notificationId) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === data.notificationId ? { ...n, isRead: true } : n))
          );
        }
        if (data.unreadCount !== undefined) {
          setUnreadCount(data.unreadCount);
        }
      };

      const handleAllRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      };

      socket.on('notification:new', handleNewNotification);
      socket.on('notification.created', handleNewNotification);
      socket.on('notification:read', handleRead);
      socket.on('notification.read', handleRead);
      socket.on('notifications:all_read', handleAllRead);
      socket.on('notification.count_updated', (data) => {
        if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
      });
    } catch (err) {
      console.warn('Socket.IO notification connection error:', err);
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await apiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      const deletedWasUnread = notifications.find((n) => n.id === id && !n.isRead);
      if (deletedWasUnread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleTogglePreference = async (
    key: keyof Pick<
      NotificationPreferenceResponse,
      'applicationUpdates' | 'bookingUpdates' | 'jobUpdates' | 'messageUpdates'
    >
  ) => {
    if (!preferences) return;
    try {
      setSavingPrefs(true);
      const updated = {
        ...preferences,
        [key]: !preferences[key],
      };
      const res = await apiClient.updateNotificationPreferences({
        [key]: updated[key],
      });
      setPreferences(res);
    } catch (err) {
      console.error('Failed to update preference:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '32px 16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#111827',
              margin: 0,
            }}
          >
            {t('notifications.title')}
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '4px 0 0 0',
            }}
          >
            Stay updated with your job applications, contracts, and messages
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              if (!showPreferences && !preferences) fetchPreferences();
              setShowPreferences(!showPreferences);
            }}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#374151',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            ⚙️ Preferences
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#ffffff',
                background: '#4f46e5',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Preferences Panel */}
      {showPreferences && preferences && (
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '12px',
            }}
          >
            Notification Preferences
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Configure which event notifications you wish to receive. Mandatory system notices cannot be turned off.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={preferences.applicationUpdates}
                disabled={savingPrefs}
                onChange={() => handleTogglePreference('applicationUpdates')}
              />
              Application Updates
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={preferences.bookingUpdates}
                disabled={savingPrefs}
                onChange={() => handleTogglePreference('bookingUpdates')}
              />
              Booking & Contract Updates
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={preferences.jobUpdates}
                disabled={savingPrefs}
                onChange={() => handleTogglePreference('jobUpdates')}
              />
              Job Status Updates
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={preferences.messageUpdates}
                disabled={savingPrefs}
                onChange={() => handleTogglePreference('messageUpdates')}
              />
              Direct Messages
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#9ca3af' }}>
              <input type="checkbox" checked={true} disabled={true} />
              System & Security (Mandatory)
            </label>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <NotificationFilters
        activeFilter={activeFilter}
        onFilterChange={(f) => {
          setActiveFilter(f);
          setPage(1);
        }}
        unreadCount={unreadCount}
      />

      {/* Notification List */}
      <NotificationList
        notifications={notifications}
        isLoading={isLoading}
        onMarkRead={handleMarkRead}
        onDelete={handleDelete}
      />

      {/* Pagination */}
      {total > limit && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '16px',
            marginTop: '24px',
          }}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Previous
          </button>

          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            Page {page} of {Math.ceil(total / limit)}
          </span>

          <button
            type="button"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: page >= Math.ceil(total / limit) ? 'not-allowed' : 'pointer',
              opacity: page >= Math.ceil(total / limit) ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

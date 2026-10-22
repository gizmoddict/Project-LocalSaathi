'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  ConversationDto,
  MessageDto,
  PresenceStatus,
  ReportReason,
} from '@localsaathi/types';
import { apiClient } from '@/lib/api-client';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { MessageComposer } from '@/components/messaging/MessageComposer';
import {
  PresenceIndicator,
  TypingIndicator,
} from '@/components/messaging/PresenceAndIndicators';

export default function ConversationDetailPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const conversationId = params?.conversationId as string;

  const [conversation, setConversation] = useState<ConversationDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [partnerPresence, setPartnerPresence] = useState<PresenceStatus>('OFFLINE');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Parse current user from JWT token payload
  useEffect(() => {
    const token = apiClient.getToken();
    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const decoded = JSON.parse(atob(payloadBase64));
          if (decoded.sub) setCurrentUserId(decoded.sub);
          else if (decoded.id) setCurrentUserId(decoded.id);
        }
      } catch {
        // Ignored
      }
    }
  }, []);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // 1. Fetch conversation details & initial messages
  const loadData = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const [conv, msgRes] = await Promise.all([
        apiClient.getConversation(conversationId),
        apiClient.listMessages(conversationId, { limit: 50 }),
      ]);
      setConversation(conv);
      setMessages(msgRes.messages || []);

      // Mark conversation read
      await apiClient.markConversationRead(conversationId).catch(() => {});
      setTimeout(() => scrollToBottom(false), 100);
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation details.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Real-time WebSocket connection to /messages
  useEffect(() => {
    const token = apiClient.getToken();
    if (!token || !conversationId) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
    let host = 'http://localhost:4000';
    try {
      const parsed = new URL(apiBase);
      host = `${parsed.protocol}//${parsed.host}`;
    } catch {}

    const socket = io(`${host}/messages`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_conversation', { conversationId });
    });

    socket.on('message.new', (newMsg: MessageDto) => {
      if (newMsg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        scrollToBottom();

        if (newMsg.senderId !== currentUserId) {
          apiClient.markConversationRead(conversationId, newMsg.id).catch(() => {});
        }
      }
    });

    socket.on('message.updated', (updatedMsg: MessageDto) => {
      if (updatedMsg.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
        );
      }
    });

    socket.on('message.deleted', (data: { messageId: string; conversationId: string }) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, body: null, isDeleted: true, deletedAt: new Date().toISOString() }
              : m
          )
        );
      }
    });

    socket.on('receipt.read', (data: { conversationId: string; userId: string; lastReadMessageId: string }) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === currentUserId
              ? {
                  ...m,
                  readReceipts: [
                    ...(m.readReceipts || []),
                    {
                      id: `rcpt-${Date.now()}`,
                      messageId: m.id,
                      userId: data.userId,
                      readAt: new Date().toISOString(),
                    },
                  ],
                }
              : m
          )
        );
      }
    });

    socket.on('typing.status', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.conversationId === conversationId && data.userId !== currentUserId) {
        setIsPartnerTyping(data.isTyping);
      }
    });

    socket.on('presence.status', (data: { userId: string; status: PresenceStatus }) => {
      const other = conversation?.members.find((m) => m.userId !== currentUserId);
      if (other && other.userId === data.userId) {
        setPartnerPresence(data.status);
      }
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('presence.heartbeat');
      }
    }, 25000);

    return () => {
      clearInterval(heartbeatInterval);
      socket.disconnect();
    };
  }, [conversationId, currentUserId, conversation]);

  const handleSendMessage = async (body: string, clientMessageId: string): Promise<boolean> => {
    if (!conversationId) return false;

    try {
      const msg = await apiClient.sendMessage(conversationId, {
        body,
        clientMessageId,
      });

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id || m.clientMessageId === clientMessageId)) {
          return prev;
        }
        return [...prev, msg];
      });
      scrollToBottom();
      return true;
    } catch (err: any) {
      alert(err.message || 'Failed to send message.');
      return false;
    }
  };

  const handleTyping = (isTyping: boolean) => {
    if (socketRef.current && socketRef.current.connected && conversationId) {
      socketRef.current.emit('typing', {
        conversationId,
        isTyping,
      });
    }
  };

  const handleEditMessage = async (messageId: string, currentBody: string) => {
    const newBody = prompt('Edit message:', currentBody);
    if (!newBody || newBody === currentBody) return;

    try {
      const updated = await apiClient.editMessage(messageId, newBody);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch (err: any) {
      alert(err.message || 'Failed to edit message.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      await apiClient.deleteMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, body: null, isDeleted: true, deletedAt: new Date().toISOString() }
            : m
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed to delete message.');
    }
  };

  const handleReportMessage = async (messageId: string) => {
    const reasonInput = prompt('Report reason (SPAM, HARASSMENT, SCAM, INAPPROPRIATE_CONTENT, FRAUD, OTHER):', 'OTHER');
    if (!reasonInput) return;
    const validReasons: ReportReason[] = ['SPAM', 'HARASSMENT', 'SCAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER'];
    const reason: ReportReason = validReasons.includes(reasonInput.toUpperCase() as ReportReason)
      ? (reasonInput.toUpperCase() as ReportReason)
      : 'OTHER';

    try {
      await apiClient.reportMessage(messageId, { reason });
      alert('Thank you. The message has been reported for moderation.');
    } catch (err: any) {
      alert(err.message || 'Failed to report message.');
    }
  };

  const handleBlockUser = async () => {
    if (!otherMember) return;
    const name = otherMember.user?.displayName || 'User';
    if (!confirm(`Are you sure you want to block ${name}?`)) return;

    try {
      await apiClient.blockUser(otherMember.userId, 'Blocked by user');
      alert(`User ${name} has been blocked.`);
      router.push('/messages');
    } catch (err: any) {
      alert(err.message || 'Failed to block user.');
    }
  };

  const otherMember = conversation?.members.find((m) => m.userId !== currentUserId);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 h-[calc(100vh-8rem)]">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/messages"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Back to all conversations"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>

            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm border border-emerald-200">
                {otherMember?.user?.displayName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="absolute bottom-0 right-0">
                <PresenceIndicator status={partnerPresence} />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-900 leading-tight">
                {otherMember?.user?.displayName || 'Conversation'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="capitalize">{otherMember?.user?.role?.toLowerCase() || 'Member'}</span>
                <span>&bull;</span>
                <span className="text-[11px] text-emerald-600 font-medium">
                  {partnerPresence === 'ONLINE' ? 'Active now' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {otherMember && (
              <button
                onClick={handleBlockUser}
                className="px-2.5 py-1 text-xs text-gray-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-gray-200"
              >
                Block
              </button>
            )}
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-gray-400 animate-pulse">
              Loading conversation messages...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-rose-500 p-4">
              <p className="text-xs font-semibold">{error}</p>
              <Link href="/messages" className="text-xs text-indigo-600 underline mt-2">
                Return to messages
              </Link>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
              <p className="text-xs font-medium">No messages yet.</p>
              <p className="text-[11px]">Send a message below to start chatting.</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isSelf={msg.senderId === currentUserId}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onReport={handleReportMessage}
                />
              ))}
              {isPartnerTyping && (
                <TypingIndicator userName={otherMember?.user?.displayName} />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input composer */}
        <MessageComposer
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          disabled={loading || !!error}
        />
      </div>
    </div>
  );
}

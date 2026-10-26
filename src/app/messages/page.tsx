'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ConversationDto,
  MessageDto,
  PresenceStatus,
  ReportReason,
} from '@localsaathi/types';
import { apiClient } from '@/lib/api-client';
import { ConversationList } from '@/components/messaging/ConversationList';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { MessageComposer } from '@/components/messaging/MessageComposer';
import {
  PresenceIndicator,
  TypingIndicator,
} from '@/components/messaging/PresenceAndIndicators';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [presences, setPresences] = useState<Record<string, PresenceStatus>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // 1. Fetch conversations
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.listConversations();
      setConversations(res.conversations || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 2. Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.listMessages(convId, { limit: 50 });
      setMessages(res.messages || []);
      // Mark as read immediately upon opening
      await apiClient.markConversationRead(convId).catch(() => {});
      // Refresh unread count in conversations
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
      setTimeout(() => scrollToBottom(false), 100);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load messages.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    } else {
      setMessages([]);
    }
  }, [selectedConvId, loadMessages]);

  // 3. Socket.IO connection to /messages namespace
  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) return;

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
      if (selectedConvId) {
        socket.emit('join_conversation', { conversationId: selectedConvId });
      }
    });

    socket.on('message.new', (newMsg: MessageDto) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === newMsg.conversationId
            ? {
                ...c,
                lastMessage: newMsg,
                lastMessageAt: newMsg.createdAt,
                unreadCount:
                  c.id === selectedConvId
                    ? 0
                    : (c.unreadCount || 0) + (newMsg.senderId !== currentUserId ? 1 : 0),
              }
            : c
        )
      );

      if (newMsg.conversationId === selectedConvId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        scrollToBottom();

        if (newMsg.senderId !== currentUserId) {
          apiClient.markConversationRead(newMsg.conversationId, newMsg.id).catch(() => {});
        }
      }
    });

    socket.on('message.updated', (updatedMsg: MessageDto) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
      );
    });

    socket.on('message.deleted', (data: { messageId: string; conversationId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, body: null, isDeleted: true, deletedAt: new Date().toISOString() }
            : m
        )
      );
    });

    socket.on('receipt.read', (data: { conversationId: string; userId: string; lastReadMessageId: string }) => {
      if (data.conversationId === selectedConvId) {
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
      if (data.conversationId === selectedConvId && data.userId !== currentUserId) {
        setTypingUsers((prev) => ({
          ...prev,
          [data.userId]: data.isTyping,
        }));
      }
    });

    socket.on('presence.status', (data: { userId: string; status: PresenceStatus }) => {
      setPresences((prev) => ({
        ...prev,
        [data.userId]: data.status,
      }));
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
  }, [selectedConvId, currentUserId]);

  useEffect(() => {
    if (socketRef.current && socketRef.current.connected && selectedConvId) {
      socketRef.current.emit('join_conversation', { conversationId: selectedConvId });
    }
  }, [selectedConvId]);

  const handleSendMessage = async (body: string, clientMessageId: string): Promise<boolean> => {
    if (!selectedConvId) return false;

    try {
      const msg = await apiClient.sendMessage(selectedConvId, {
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

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConvId
            ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt }
            : c
        )
      );

      return true;
    } catch (err: any) {
      alert(err.message || 'Failed to send message.');
      return false;
    }
  };

  const handleTyping = (isTyping: boolean) => {
    if (socketRef.current && socketRef.current.connected && selectedConvId) {
      socketRef.current.emit('typing', {
        conversationId: selectedConvId,
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

  const handleBlockUser = async (targetUserId: string, name: string) => {
    if (!confirm(`Are you sure you want to block ${name}? They won't be able to message you.`)) return;

    try {
      await apiClient.blockUser(targetUserId, 'Blocked by user');
      alert(`User ${name} has been blocked.`);
      setSelectedConvId(null);
      loadConversations();
    } catch (err: any) {
      alert(err.message || 'Failed to block user.');
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedConvId);
  const otherMember = selectedConversation?.members.find((m) => m.userId !== currentUserId);
  const partnerStatus = otherMember ? presences[otherMember.userId] || 'OFFLINE' : 'OFFLINE';
  const isPartnerTyping = otherMember ? !!typingUsers[otherMember.userId] : false;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-8rem)]">
      {errorMessage && (
        <div className="mb-4 p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
          {errorMessage}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm h-full flex overflow-hidden">
        {/* Left Column: Conversations List */}
        <div
          className={`w-full md:w-80 lg:w-96 flex-shrink-0 h-full ${
            selectedConvId ? 'hidden md:block' : 'block'
          }`}
        >
          <ConversationList
            conversations={conversations}
            currentUserId={currentUserId}
            selectedConversationId={selectedConvId || undefined}
            onSelectConversation={(id) => setSelectedConvId(id)}
            loading={loadingConversations}
            presences={presences}
          />
        </div>

        {/* Right Column: Chat Window or Placeholder */}
        <div
          className={`flex-1 flex flex-col h-full bg-slate-50 ${
            !selectedConvId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedConvId(null)}
                    className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    title="Back to conversations"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm border border-emerald-200">
                      {otherMember?.user?.displayName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="absolute bottom-0 right-0">
                      <PresenceIndicator status={partnerStatus} />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                      {otherMember?.user?.displayName || 'User'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="capitalize">{otherMember?.user?.role?.toLowerCase() || 'Member'}</span>
                      <span>&bull;</span>
                      <span className="text-[11px] text-emerald-600 font-medium">
                        {partnerStatus === 'ONLINE' ? 'Active now' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1">
                  {otherMember && (
                    <button
                      onClick={() => handleBlockUser(otherMember.userId, otherMember.user?.displayName || 'User')}
                      className="p-1.5 text-xs text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Block user"
                    >
                      Block
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-gray-400 animate-pulse">
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                    <p className="text-xs font-medium">No messages yet.</p>
                    <p className="text-[11px]">Send a message to start the conversation.</p>
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

              {/* Message Composer */}
              <MessageComposer
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Select a conversation
              </h3>
              <p className="text-xs text-gray-500 max-w-sm">
                Choose a conversation from the left to start messaging your employer or worker in real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

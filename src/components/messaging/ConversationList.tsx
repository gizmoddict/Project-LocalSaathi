import React, { useState } from 'react';
import { ConversationDto } from '@localsaathi/types';
import { ConversationItem } from './ConversationItem';

interface ConversationListProps {
  conversations: ConversationDto[];
  currentUserId: string;
  selectedConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  loading?: boolean;
  presences?: Record<string, 'ONLINE' | 'OFFLINE' | 'AWAY'>;
}

export function ConversationList({
  conversations,
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  loading = false,
  presences = {},
}: ConversationListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = conversations.filter((c) => {
    const otherMember = c.members.find((m) => m.userId !== currentUserId);
    const name = otherMember?.user?.displayName || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Search Header */}
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Messages</h2>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
          />
          <svg
            className="w-4 h-4 text-gray-400 absolute left-2.5 top-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {loading ? (
          <div className="p-4 text-center text-xs text-gray-400 animate-pulse">
            Loading conversations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="w-10 h-10 text-gray-300 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-xs text-gray-500 font-medium">No conversations found</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Conversations appear once you apply for jobs or confirm bookings.
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const otherMember = conv.members.find((m) => m.userId !== currentUserId);
            const status = otherMember ? presences[otherMember.userId] ?? 'OFFLINE' : 'OFFLINE';

            return (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                currentUserId={currentUserId}
                isSelected={conv.id === selectedConversationId}
                onSelect={onSelectConversation}
                presenceStatus={status}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

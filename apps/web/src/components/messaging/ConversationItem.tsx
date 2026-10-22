import React from 'react';
import { ConversationDto } from '@localsaathi/types';
import { PresenceIndicator } from './PresenceAndIndicators';

interface ConversationItemProps {
  conversation: ConversationDto;
  currentUserId: string;
  isSelected?: boolean;
  onSelect: (conversationId: string) => void;
  presenceStatus?: 'ONLINE' | 'OFFLINE' | 'AWAY';
}

export function ConversationItem({
  conversation,
  currentUserId,
  isSelected = false,
  onSelect,
  presenceStatus = 'OFFLINE',
}: ConversationItemProps) {
  // Find other member
  const otherMember = conversation.members.find(
    (m) => m.userId !== currentUserId,
  );
  const otherUser = otherMember?.user;
  const displayName = otherUser?.displayName || 'User';

  const unreadCount = conversation.unreadCount ?? 0;
  const lastMsg = conversation.lastMessage;
  const timeText = conversation.lastMessageAt
    ? new Date(conversation.lastMessageAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={`w-full text-left p-3 flex items-center gap-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600' : ''
      }`}
    >
      {/* Avatar & Presence */}
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-sm uppercase">
          {displayName.slice(0, 2)}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5">
          <PresenceIndicator status={presenceStatus} />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-medium text-sm text-gray-900 truncate">
            {displayName}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0 ml-2">
            {timeText}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1">
          <p className="text-xs text-gray-500 truncate">
            {lastMsg?.body || 'No messages yet'}
          </p>

          {unreadCount > 0 && (
            <span className="shrink-0 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

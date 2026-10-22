import React, { useState } from 'react';
import { MessageDto } from '@localsaathi/types';
import { ReadReceipt } from './PresenceAndIndicators';

interface MessageBubbleProps {
  message: MessageDto;
  isSelf: boolean;
  onEdit?: (messageId: string, currentBody: string) => void;
  onDelete?: (messageId: string) => void;
  onReport?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isSelf,
  onEdit,
  onDelete,
  onReport,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDeleted = !!message.deletedAt;

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isRead = (message.readReceipts?.length ?? 0) > 0;

  return (
    <div className={`flex flex-col mb-3 ${isSelf ? 'items-end' : 'items-start'} group relative`}>
      {!isSelf && message.sender?.displayName && (
        <span className="text-xs text-gray-500 font-medium mb-1 px-1">
          {message.sender.displayName}
        </span>
      )}

      <div className="flex items-center gap-1.5 max-w-[85%] md:max-w-[70%]">
        {/* Context menu for sender (self) */}
        {isSelf && !isDeleted && (
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Message options"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 text-xs">
                {message.messageType === 'TEXT' && onEdit && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(message.id, message.body ?? '');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(message.id);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isDeleted
              ? 'bg-gray-100 text-gray-500 italic border border-gray-200'
              : isSelf
              ? 'bg-indigo-600 text-white rounded-br-xs'
              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-xs shadow-xs'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">
            {isDeleted ? 'Message deleted' : message.body ?? message.content}
          </div>

          {/* Attachments */}
          {!isDeleted && message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((att) => (
                <div key={att.id} className="text-xs underline">
                  <a
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={isSelf ? 'text-indigo-100 hover:text-white' : 'text-indigo-600 hover:underline'}
                  >
                    {att.fileName || 'Attachment'}
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Timestamp and Read Status */}
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
              isSelf ? 'text-indigo-200' : 'text-gray-400'
            }`}
          >
            <span>{formattedTime}</span>
            {message.editedAt && !isDeleted && <span>(edited)</span>}
            {isSelf && !isDeleted && <ReadReceipt isRead={isRead} isDelivered />}
          </div>
        </div>

        {/* Report action for received message */}
        {!isSelf && onReport && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onReport(message.id)}
              className="p-1 rounded-full text-gray-400 hover:text-red-500"
              title="Report message"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

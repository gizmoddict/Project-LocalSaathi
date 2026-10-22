import React from 'react';

interface PresenceIndicatorProps {
  status: 'ONLINE' | 'OFFLINE' | 'AWAY';
  className?: string;
  showText?: boolean;
}

export function PresenceIndicator({
  status,
  className = '',
  showText = false,
}: PresenceIndicatorProps) {
  const isOnline = status === 'ONLINE';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          isOnline ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-gray-300'
        }`}
        title={isOnline ? 'Online' : 'Offline'}
      />
      {showText && (
        <span className="text-xs text-gray-500">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      )}
    </span>
  );
}

interface ReadReceiptProps {
  isRead?: boolean;
  isDelivered?: boolean;
  className?: string;
}

export function ReadReceipt({
  isRead,
  isDelivered,
  className = '',
}: ReadReceiptProps) {
  if (isRead) {
    return (
      <span className={`inline-flex items-center text-blue-500 ${className}`} title="Read">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <svg className="-ml-2 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  if (isDelivered) {
    return (
      <span className={`inline-flex items-center text-gray-400 ${className}`} title="Delivered">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <svg className="-ml-2 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center text-gray-400 ${className}`} title="Sent">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

interface TypingIndicatorProps {
  userName?: string;
}

export function TypingIndicator({ userName }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-gray-50 rounded-full w-fit">
      <span>{userName ? `${userName} is typing` : 'Typing'}</span>
      <span className="flex gap-1 items-center">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

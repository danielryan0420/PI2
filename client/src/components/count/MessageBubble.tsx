import React, { useState } from 'react';
import { formatDateTime } from '../../lib/utils';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  onReply: (msg: Message) => void;
  onScrollToMessage: (msgId: number) => void;
}

export function MessageBubble({ message: m, isOwn, onReply, onScrollToMessage }: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false);

  const isSystem = m.sender === 'SYSTEM';

  const bubbleBg = isSystem
    ? 'bg-amber-50 border border-amber-300 text-amber-900'
    : isOwn
    ? 'bg-blue-600 text-white'
    : m.role === 'admin'
    ? 'bg-purple-600 text-white'
    : 'bg-gray-100 text-gray-800';

  const timeColor = isSystem
    ? 'text-amber-500'
    : isOwn
    ? 'text-blue-200'
    : m.role === 'admin'
    ? 'text-purple-300'
    : 'text-gray-500';

  const senderColor = isSystem
    ? 'text-amber-700 font-semibold'
    : isOwn
    ? 'text-blue-200'
    : m.role === 'admin'
    ? 'text-purple-200'
    : 'text-gray-500';

  return (
    <div
      data-msg-id={m.id}
      className={`flex items-end gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isOwn && !isSystem && (
        <button
          onClick={() => onReply(m)}
          className={`text-gray-400 hover:text-blue-500 transition text-sm pb-1 ${hovered ? 'opacity-100' : 'opacity-0'}`}
          title="Reply to this message"
        >
          ↩
        </button>
      )}

      <div className={`relative max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${bubbleBg} ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
        {/* Sender label */}
        {(!isOwn || isSystem) && (
          <div className={`text-xs font-medium mb-1 ${senderColor}`}>
            {isSystem ? '⚠️ SYSTEM' : m.sender}
          </div>
        )}

        {/* Quote block */}
        {m.reply_to_id && m.reply_to_body && (
          <button
            onClick={() => onScrollToMessage(m.reply_to_id!)}
            className={`w-full text-left mb-2 border-l-4 pl-2 rounded-sm py-1 pr-2 transition ${
              isOwn
                ? 'border-blue-300 bg-blue-700/40 hover:bg-blue-700/60'
                : m.role === 'admin'
                ? 'border-purple-300 bg-purple-700/40 hover:bg-purple-700/60'
                : 'border-gray-300 bg-gray-200 hover:bg-gray-300'
            }`}
          >
            <div className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-blue-200' : m.role === 'admin' ? 'text-purple-200' : 'text-gray-600'}`}>
              {m.reply_to_sender}
            </div>
            <div className={`text-xs truncate ${isOwn ? 'text-blue-100' : m.role === 'admin' ? 'text-purple-100' : 'text-gray-600'}`}>
              {m.reply_to_body}
            </div>
          </button>
        )}

        <div className="whitespace-pre-wrap">{m.body}</div>
        <div className={`text-xs mt-1 ${timeColor}`}>{formatDateTime(m.sent_at)}</div>
      </div>

      {!isOwn && !isSystem && (
        <button
          onClick={() => onReply(m)}
          className={`text-gray-400 hover:text-blue-500 transition text-sm pb-1 ${hovered ? 'opacity-100' : 'opacity-0'}`}
          title="Reply to this message"
        >
          ↩
        </button>
      )}
    </div>
  );
}

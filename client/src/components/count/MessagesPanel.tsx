import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { formatDateTime } from '../../lib/utils';
import type { Message } from '../../types';

export function MessagesPanel() {
  const { username, session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    api.get<Message[]>(`/sessions/${session.id}/messages/general`, { username })
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));

    const socket = getSocket();
    socket.on('message:created', (msg: Message) => {
      if (msg.count_id === null) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    return () => { socket.off('message:created'); };
  }, [session?.id, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!body.trim() || !session) return;
    setSending(true);
    try {
      await api.post<Message>(`/sessions/${session.id}/messages`, {
        sender: username,
        role: 'counter',
        body: body.trim(),
      }, { username });
      setBody('');
    } catch {
      // silent — socket will deliver
    } finally {
      setSending(false);
    }
  }

  const unanswered = messages.filter((m) => m.role === 'counter').length > 0 &&
    !messages.some((m) => m.role === 'office');

  return (
    <div className="flex flex-col h-full min-h-[320px]">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800">Messages</h2>
        <span className="text-xs text-gray-400">General questions to office</span>
        {unanswered && (
          <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            Awaiting reply
          </span>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-3 pr-1" style={{ maxHeight: 340 }}>
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">
            No messages yet — ask the office a question below
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender.toLowerCase() === username.toLowerCase() ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.sender.toLowerCase() === username.toLowerCase()
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {m.sender.toLowerCase() !== username.toLowerCase() && (
                  <div className="text-xs font-medium text-gray-500 mb-1">{m.sender}</div>
                )}
                <div>{m.body}</div>
                <div className={`text-xs mt-1 ${m.sender.toLowerCase() === username.toLowerCase() ? 'text-blue-200' : 'text-gray-400'}`}>
                  {formatDateTime(m.sent_at)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Type a question for office… (Enter to send)"
          className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="self-end bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

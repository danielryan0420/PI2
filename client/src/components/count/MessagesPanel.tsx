import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import type { Message } from '../../types';

export function MessagesPanel() {
  const { username, session } = useSession();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [selectedThread, setSelectedThread] = useState<number | null>(null); // null=none, 0=general, N=count_id
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    if (!session) return;
    try {
      const data = await api.get<Message[]>(`/sessions/${session.id}/messages/mine`, { username });
      setAllMessages(data);
    } catch { /**/ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!session) return;
    loadMessages();
  }, [session?.id, username]);

  // Auto-scroll when selected thread messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThread, allMessages]);

  // Build thread map: key 0 = general, key N = count_id
  const threadMap = allMessages.reduce<Record<number, Message[]>>((acc, m) => {
    const key = m.count_id ?? 0;
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  // Add a general thread slot even if empty so counter can always send a general message
  if (!threadMap[0]) threadMap[0] = [];

  const threadKeys = [0, ...Object.keys(threadMap).map(Number).filter((k) => k !== 0)];

  const threadMessages = selectedThread !== null ? (threadMap[selectedThread] ?? []) : [];

  async function handleSend() {
    if (!replyBody.trim() || !session || selectedThread === null) return;
    setSending(true);
    try {
      if (selectedThread === 0) {
        await api.post<Message>(`/sessions/${session.id}/messages`, {
          sender: username,
          role: 'counter',
          body: replyBody.trim(),
        }, { username });
      } else {
        await api.post<Message>(`/counts/${selectedThread}/messages`, {
          sender: username,
          role: 'counter',
          body: replyBody.trim(),
        }, { username });
      }
      setReplyBody('');
    } catch { /**/ }
    finally { setSending(false); }
  }

  function threadLabel(key: number) {
    if (key === 0) return 'General';
    const msgs = threadMap[key] ?? [];
    const mat = msgs[0]?.material_number;
    return `Count #${key}${mat ? ` · ${mat}` : ''}`;
  }

  function hasOfficeReply(key: number) {
    return (threadMap[key] ?? []).some((m) => m.role === 'admin');
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">Messages</h2>
        <span className="text-xs text-gray-400">Questions & office replies</span>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Thread selector */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {threadKeys.map((key) => {
              const unanswered = (threadMap[key] ?? []).length > 0 && !hasOfficeReply(key) && key !== 0;
              const isSelected = selectedThread === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedThread(key)}
                  className={`no-min-h shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : unanswered
                      ? 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {threadLabel(key)}
                  {unanswered && !isSelected && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  )}
                  {hasOfficeReply(key) && !isSelected && (
                    <span className="ml-1 text-green-500">✓</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Thread body */}
          {selectedThread === null ? (
            <div className="text-sm text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">
              Select a thread above, or tap <strong>General</strong> to ask the office a question
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Messages */}
              <div
                className="flex flex-col gap-2 overflow-y-auto"
                style={{ maxHeight: 320 }}
              >
                {threadMessages.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">
                    No messages yet — type your question below
                  </div>
                ) : (
                  threadMessages.map((m) => (
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

              {/* Reply input */}
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  placeholder={selectedThread === 0 ? 'Ask the office a question… (Enter to send)' : 'Reply to this thread… (Enter to send)'}
                  className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!replyBody.trim() || sending}
                  className="self-end bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

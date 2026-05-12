import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { MessageBubble } from './MessageBubble';
import type { Message, MessageThread } from '../../types';

export function MessagesPanel() {
  const { username, session, role } = useSession();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = { username: username || '', role: role || 'counter' };

  async function loadThreads() {
    if (!session) return;
    try {
      const data = await api.get<MessageThread[]>(`/sessions/${session.id}/threads`, headers);
      setThreads(data);
    } catch { /**/ }
    finally { setLoading(false); }
  }

  async function loadMessages(threadId: number) {
    try {
      const data = await api.get<Message[]>(`/threads/${threadId}/messages`);
      setMessages(data);
    } catch { /**/ }
  }

  useEffect(() => {
    if (!session) return;
    loadThreads();
    pollRef.current = setInterval(() => {
      loadThreads();
      if (selectedThreadId) loadMessages(selectedThreadId);
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session?.id]);

  useEffect(() => {
    if (selectedThreadId) loadMessages(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function scrollToMessage(msgId: number) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1', 'rounded-2xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1', 'rounded-2xl'), 1500);
    }
  }

  async function handleCreateThread() {
    if (!newQuestion.trim() || !session) return;
    setCreating(true);
    try {
      await api.post(`/sessions/${session.id}/threads`, { title: newQuestion }, headers);
      setNewQuestion('');
      await loadThreads();
    } catch { /**/ }
    finally { setCreating(false); }
  }

  async function handleSend() {
    if (!replyBody.trim() || selectedThreadId === null) return;
    setSending(true);
    try {
      await api.post(`/threads/${selectedThreadId}/messages`, {
        body: replyBody,
        reply_to_id: replyingTo?.id ?? null,
      }, headers);
      setReplyBody('');
      setReplyingTo(null);
      await loadMessages(selectedThreadId);
      await loadThreads();
    } catch { /**/ }
    finally { setSending(false); }
  }

  const unansweredThreads = threads.filter(t => !t.answered);
  const answeredThreads = threads.filter(t => t.answered);
  const selectedThread = threads.find(t => t.id === selectedThreadId);

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>

      {/* ── LEFT: Thread sidebar ── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Threads</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading && <p className="text-xs text-gray-400 text-center py-6">Loading…</p>}

          {!loading && threads.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6 px-3">No threads yet — ask a question below</p>
          )}

          {unansweredThreads.length > 0 && (
            <div className="mb-3">
              <p className="px-3 py-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider">Waiting for reply</p>
              {unansweredThreads.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`w-full px-3 py-2 text-left transition ${
                    selectedThreadId === t.id ? 'bg-blue-50 border-r-2 border-blue-500' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.message_count ?? 0} msg{(t.message_count ?? 0) !== 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          )}

          {answeredThreads.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[10px] font-bold text-green-600 uppercase tracking-wider">Answered</p>
              {answeredThreads.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`w-full px-3 py-2 text-left transition ${
                    selectedThreadId === t.id ? 'bg-green-50 border-r-2 border-green-500' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm text-gray-700 truncate">{t.title}</p>
                  <p className="text-xs text-green-600 mt-0.5">✓ {t.answered_by}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* New question at bottom of sidebar */}
        <div className="p-3 border-t border-gray-200 bg-gray-50 flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-600">New question</p>
          <textarea
            rows={2}
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateThread(); } }}
            placeholder="Type your question…"
            className="w-full resize-none border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreateThread}
            disabled={!newQuestion.trim() || creating}
            className="self-end bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-3 py-1 rounded text-xs transition-colors"
          >
            {creating ? '…' : 'Ask'}
          </button>
        </div>
      </div>

      {/* ── RIGHT: Thread view ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Select a thread to view messages
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <h3 className="font-semibold text-gray-800 text-sm">{selectedThread.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedThread.created_by} · {formatDateTime(selectedThread.created_at)}
                {selectedThread.answered && (
                  <span className="ml-2 text-green-600 font-medium">✓ Answered by {selectedThread.answered_by}</span>
                )}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No messages yet — type below to start</p>
              ) : (
                messages.map(m => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isOwn={m.sender.toLowerCase() === (username || '').toLowerCase()}
                    onReply={msg => { setReplyingTo(msg); inputRef.current?.focus(); }}
                    onScrollToMessage={scrollToMessage}
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex-shrink-0 border-t border-gray-200 bg-white">
              {replyingTo && (
                <div className="flex items-start gap-2 px-4 pt-3 pb-1">
                  <div className="flex-1 border-l-4 border-blue-400 bg-blue-50 rounded px-3 py-1.5 min-w-0">
                    <p className="text-xs font-semibold text-blue-700">{replyingTo.sender}</p>
                    <p className="text-xs text-blue-600 truncate">{replyingTo.body}</p>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">×</button>
                </div>
              )}
              <div className="flex gap-2 px-4 py-3">
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={replyingTo ? `Replying to ${replyingTo.sender}…` : 'Type a message… (Enter to send)'}
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
          </>
        )}
      </div>
    </div>
  );
}

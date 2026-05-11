import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { formatDateTime } from '../../lib/utils';
import type { Message, MessageThread } from '../../types';

export function MessagesPanel() {
  const { username, session, role } = useSession();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    if (!session) return;
    try {
      const data = await api.get<MessageThread[]>(`/sessions/${session.id}/threads`, {
        'x-username': username,
        'x-role': role || 'counter',
      });
      setThreads(data);
    } catch (e) {
      console.error('Failed to load threads:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(threadId: number) {
    try {
      const data = await api.get<Message[]>(`/threads/${threadId}/messages`);
      setMessages(data);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  }

  useEffect(() => {
    if (!session) return;
    loadThreads();

    const socket = getSocket();
    socket.on('thread:created', () => { loadThreads(); });
    socket.on('message:created', () => {
      if (selectedThreadId) loadMessages(selectedThreadId);
    });
    return () => {
      socket.off('thread:created');
      socket.off('message:created');
    };
  }, [session?.id, username]);

  useEffect(() => {
    if (selectedThreadId) {
      loadMessages(selectedThreadId);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThreadId, messages]);

  async function handleCreateThread() {
    if (!newQuestion.trim() || !session) return;
    setCreating(true);
    try {
      await api.post(`/sessions/${session.id}/threads`, { title: newQuestion }, {
        'x-username': username,
        'x-role': role || 'counter',
      });
      setNewQuestion('');
      await loadThreads();
    } catch (e) {
      console.error('Failed to create thread:', e);
    } finally {
      setCreating(false);
    }
  }

  async function handleSend() {
    if (!replyBody.trim() || selectedThreadId === null) return;
    setSending(true);
    try {
      await api.post(`/threads/${selectedThreadId}/messages`, { body: replyBody }, {
        'x-username': username,
        'x-role': role || 'counter',
      });
      setReplyBody('');
      await loadMessages(selectedThreadId);
    } catch (e) {
      console.error('Failed to send message:', e);
    } finally {
      setSending(false);
    }
  }

  const unansweredThreads = threads.filter(t => !t.answered);
  const answeredThreads = threads.filter(t => t.answered);
  const selectedThread = threads.find(t => t.id === selectedThreadId);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">Message Threads</h2>
        <span className="text-xs text-gray-400">Questions & answers</span>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
      ) : (
        <div className="grid grid-cols-3 gap-4 h-full">
          {/* Left: Thread list */}
          <div className="col-span-1 flex flex-col gap-4 overflow-y-auto">
            {unansweredThreads.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Unanswered</h3>
                <div className="flex flex-col gap-1">
                  {unansweredThreads.map(thread => (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`p-2 rounded text-left transition text-sm ${
                        selectedThreadId === thread.id
                          ? 'bg-blue-100 border-l-4 border-blue-500'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="font-sm font-semibold truncate">{thread.title}</div>
                      <div className="text-xs text-gray-500">{thread.message_count || 0} messages</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {answeredThreads.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Answered</h3>
                <div className="flex flex-col gap-1">
                  {answeredThreads.map(thread => (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`p-2 rounded text-left transition text-sm ${
                        selectedThreadId === thread.id
                          ? 'bg-green-100 border-l-4 border-green-500'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="font-sm font-semibold truncate">{thread.title}</div>
                      <div className="text-xs text-gray-500">by {thread.answered_by}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {threads.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded">
                No threads yet
              </div>
            )}
          </div>

          {/* Right: Thread view and reply */}
          <div className="col-span-2 flex flex-col gap-4 overflow-y-auto">
            {selectedThread ? (
              <>
                <div className="bg-gray-50 p-3 rounded border border-gray-200">
                  <h3 className="font-semibold text-gray-800">{selectedThread.title}</h3>
                  <div className="text-xs text-gray-600 mt-1">
                    Asked by {selectedThread.created_by} • {formatDateTime(selectedThread.created_at)}
                    {selectedThread.answered && (
                      <span className="ml-2 text-green-600">✓ Answered by {selectedThread.answered_by}</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-2 overflow-y-auto bg-white rounded border border-gray-200 p-3">
                  {messages.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-8">
                      No messages yet — type your question below
                    </div>
                  ) : (
                    messages.map(m => (
                      <div
                        key={m.id}
                        className={`flex ${m.sender.toLowerCase() === username.toLowerCase() ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.sender.toLowerCase() === username.toLowerCase()
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {m.sender.toLowerCase() !== username.toLowerCase() && (
                            <div className="text-xs font-medium mb-1 opacity-80">{m.sender}</div>
                          )}
                          <div>{m.body}</div>
                          <div className={`text-xs mt-1 ${m.sender.toLowerCase() === username.toLowerCase() ? 'text-blue-200' : 'text-gray-500'}`}>
                            {formatDateTime(m.sent_at)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="Type your reply… (Enter to send)"
                    className="flex-1 resize-none border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!replyBody.trim() || sending}
                    className="self-end bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded">
                Select a thread to view messages
              </div>
            )}
          </div>
        </div>
      )}

      {/* New thread form */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Ask a Question</h3>
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="Type your question…"
            className="flex-1 resize-none border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreateThread}
            disabled={!newQuestion.trim() || creating}
            className="self-end bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors"
          >
            {creating ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

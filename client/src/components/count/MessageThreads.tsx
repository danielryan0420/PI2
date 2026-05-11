import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatDateTime } from '../../lib/utils';
import type { MessageThread, Message } from '../../types';

interface MessageThreadsProps {
  sessionId: number;
  username: string;
  role: string;
  threads: MessageThread[];
  selectedThreadId: number | null;
  onSelectThread: (threadId: number) => void;
  onCreateThread: (title: string, countId?: number) => Promise<void>;
  onPostMessage: (threadId: number, body: string) => Promise<void>;
  onThreadsRefresh: () => Promise<void>;
}

export function MessageThreads({
  sessionId,
  username,
  role,
  threads,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
  onPostMessage,
  onThreadsRefresh,
}: MessageThreadsProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);
  const [postingMessage, setPostingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  async function loadThreadMessages() {
    if (selectedThreadId === null) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/threads/${selectedThreadId}/messages`);
      const data = await res.json() as Message[];
      setMessages(data);
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    loadThreadMessages();
  }, [selectedThreadId]);

  async function handleCreateThread() {
    if (!newThreadTitle.trim()) return;
    setCreatingThread(true);
    try {
      await onCreateThread(newThreadTitle);
      setNewThreadTitle('');
      await onThreadsRefresh();
    } catch (e) {
      console.error('Failed to create thread:', e);
    } finally {
      setCreatingThread(false);
    }
  }

  async function handlePostMessage() {
    if (selectedThreadId === null || !replyText.trim()) return;
    setPostingMessage(true);
    try {
      await onPostMessage(selectedThreadId, replyText);
      setReplyText('');
      await loadThreadMessages();
    } catch (e) {
      console.error('Failed to post message:', e);
    } finally {
      setPostingMessage(false);
    }
  }

  const selectedThread = threads.find(t => t.id === selectedThreadId);
  const unansweredThreads = threads.filter(t => !t.answered);
  const answeredThreads = threads.filter(t => t.answered);

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {/* Thread list */}
      <div className="col-span-1 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Questions</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-2 overflow-y-auto max-h-96">
            {unansweredThreads.length === 0 && (
              <p className="text-sm text-gray-500">No unanswered questions</p>
            )}
            {unansweredThreads.map(thread => (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={`p-2 rounded text-left transition ${
                  selectedThreadId === thread.id
                    ? 'bg-blue-100 border-l-4 border-blue-500'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <div className="font-sm font-semibold truncate">{thread.title}</div>
                <div className="text-xs text-gray-600">
                  {thread.created_by} • {thread.message_count || 0} msg
                </div>
              </button>
            ))}
          </CardBody>
        </Card>

        {answeredThreads.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-sm">Answered</h3>
            </CardHeader>
            <CardBody className="flex flex-col gap-2 overflow-y-auto max-h-48">
              {answeredThreads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => onSelectThread(thread.id)}
                  className={`p-2 rounded text-left transition text-sm ${
                    selectedThreadId === thread.id
                      ? 'bg-green-100 border-l-4 border-green-500'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="truncate">{thread.title}</div>
                  <div className="text-xs text-gray-500">by {thread.answered_by}</div>
                </button>
              ))}
            </CardBody>
          </Card>
        )}
      </div>

      {/* Thread view */}
      <div className="col-span-2 flex flex-col gap-4">
        {selectedThread ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold">{selectedThread.title}</h2>
                    <p className="text-sm text-gray-600">
                      Asked by {selectedThread.created_by} • {formatDateTime(selectedThread.created_at)}
                    </p>
                  </div>
                  {selectedThread.answered && (
                    <Badge variant="success">Answered</Badge>
                  )}
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-3 overflow-y-auto max-h-96">
                {loadingMessages ? (
                  <p className="text-gray-500">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="text-gray-500">No messages yet</p>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded ${
                        msg.role === 'counter' ? 'bg-blue-50 border-l-4 border-blue-300' : 'bg-green-50 border-l-4 border-green-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">
                          {msg.sender}
                          <Badge variant={msg.role === 'counter' ? 'info' : 'success'} className="ml-2 text-xs">
                            {msg.role}
                          </Badge>
                        </span>
                        <span className="text-xs text-gray-500">{formatDateTime(msg.sent_at)}</span>
                      </div>
                      <p className="text-sm">{msg.body}</p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-2">
                <Textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                />
                <Button
                  onClick={handlePostMessage}
                  disabled={postingMessage || !replyText.trim()}
                  className="self-end"
                >
                  {postingMessage ? 'Posting...' : 'Post Reply'}
                </Button>
              </CardBody>
            </Card>
          </>
        ) : (
          <Card>
            <CardBody className="text-center text-gray-500 py-8">
              Select a question to view messages
            </CardBody>
          </Card>
        )}
      </div>

      {/* New thread */}
      <div className="col-span-3">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-sm">Ask a Question</h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            <Textarea
              value={newThreadTitle}
              onChange={e => setNewThreadTitle(e.target.value)}
              placeholder="Ask a question..."
              rows={2}
            />
            <Button
              onClick={handleCreateThread}
              disabled={creatingThread || !newThreadTitle.trim()}
              className="self-start"
            >
              {creatingThread ? 'Creating...' : 'Create Thread'}
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

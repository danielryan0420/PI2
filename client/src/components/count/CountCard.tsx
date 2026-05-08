import React, { useState } from 'react';
import { StatusBadge } from '../ui/Badge';
import { Card, CardBody } from '../ui/Card';
import { formatDateTime, formatNumber } from '../../lib/utils';
import type { Count, Message } from '../../types';
import { api } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';

interface CountCardProps {
  count: Count;
  onRecount?: (count: Count) => void;
}

export function CountCard({ count, onRecount }: CountCardProps) {
  const { username, role } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  async function toggleExpand() {
    if (!expanded) {
      setLoadingMsgs(true);
      try {
        const msgs = await api.get<Message[]>(`/counts/${count.id}/messages`);
        setMessages(msgs);
      } catch { /**/ }
      finally { setLoadingMsgs(false); }
    }
    setExpanded((v) => !v);
  }

  async function sendMessage() {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const msg = await api.post<Message>(`/counts/${count.id}/messages`, {
        sender: username,
        role: role ?? 'counter',
        body: newMessage.trim(),
      });
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
    } catch { /**/ }
    finally { setSending(false); }
  }

  const statusColor = count.status === 'verified' ? 'border-l-green-500' : count.status === 'flagged' ? 'border-l-red-500' : 'border-l-blue-400';

  return (
    <Card className={`border-l-4 ${statusColor}`} onClick={toggleExpand}>
      <CardBody className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-800">{count.material_number}</span>
              <StatusBadge status={count.status} />
              <span className="text-xs text-gray-400">#{count.id}</span>
            </div>
            {count.material_description && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{count.material_description}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className="text-lg font-bold text-gray-800">{formatNumber(count.quantity)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span>{count.sloc}</span>
          {count.wm_bin && <span>WM: {count.wm_bin}</span>}
          {count.zbin && <span>ZBIN: {count.zbin}</span>}
          <span className="ml-auto">{formatDateTime(count.created_at)}</span>
        </div>

        {count.status === 'flagged' && (
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
            <span>⚠ Flagged for recount</span>
            {onRecount && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRecount(count); }}
                className="no-min-h shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1 rounded-lg transition-colors"
              >
                Recount
              </button>
            )}
          </div>
        )}

        {/* Expanded: messages */}
        {expanded && (
          <div className="mt-2 border-t border-gray-100 pt-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {loadingMsgs ? (
              <p className="text-xs text-gray-400">Loading messages…</p>
            ) : (
              <>
                {messages.map((m) => (
                  <div key={m.id} className={`text-xs rounded-lg px-3 py-2 ${m.role === 'admin' ? 'bg-purple-50 text-purple-800 self-start' : 'bg-blue-50 text-blue-800 self-end'}`}>
                    <span className="font-medium">{m.sender}: </span>{m.body}
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask a question…"
                    className="flex-1 min-h-[36px] px-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Button size="sm" onClick={sendMessage} loading={sending} className="shrink-0">Send</Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

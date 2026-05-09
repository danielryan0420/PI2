import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { StatusBadge } from '../components/ui/Badge';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { Count, Message } from '../types';

type Tab = 'review' | 'messages';

export function OfficePage() {
  const { username, role, session } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('review');

  const headers = { role: role ?? '', username };

  // ─── Review tab state ────────────────────────────────────────────────────
  const [counts, setCounts] = useState<Count[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [filterSloc, setFilterSloc] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterMat, setFilterMat] = useState('');
  const [editTarget, setEditTarget] = useState<Count | null>(null);
  const [editChanges, setEditChanges] = useState<Partial<Count>>({});
  const [editReason, setEditReason] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [flagTarget, setFlagTarget] = useState<Count | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [verifyLoading, setVerifyLoading] = useState<number | null>(null);

  const loadCounts = useCallback(async () => {
    if (!session) return;
    setLoadingCounts(true);
    try {
      const params = new URLSearchParams();
      if (filterSloc) params.set('sloc', filterSloc);
      if (filterStatus) params.set('status', filterStatus);
      if (filterUser) params.set('username', filterUser);
      if (filterMat) params.set('material', filterMat);
      const data = await api.get<Count[]>(`/sessions/${session.id}/counts?${params}`, headers);
      setCounts(data);
    } catch { toast('Failed to load counts', 'error'); }
    finally { setLoadingCounts(false); }
  }, [session?.id, filterSloc, filterStatus, filterUser, filterMat]);

  useEffect(() => { if (session) loadCounts(); }, [loadCounts]);

  async function handleVerify(count: Count) {
    setVerifyLoading(count.id);
    try {
      await api.patch(`/counts/${count.id}/verify`, { verifiedBy: username }, headers);
      setCounts((prev) => prev.map((c) => c.id === count.id ? { ...c, status: 'verified' } : c));
      toast(`Count #${count.id} verified`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setVerifyLoading(null); }
  }

  async function handleFlag() {
    if (!flagTarget || !flagReason.trim()) { toast('Reason required', 'error'); return; }
    try {
      await api.patch(`/counts/${flagTarget.id}/flag`, { flaggedBy: username, reason: flagReason }, headers);
      setCounts((prev) => prev.map((c) => c.id === flagTarget.id ? { ...c, status: 'flagged' } : c));
      toast(`Count #${flagTarget.id} flagged`, 'success');
      setFlagTarget(null);
      setFlagReason('');
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  async function handleEdit() {
    if (!editTarget || !editReason.trim()) { toast('Reason required', 'error'); return; }
    setEditLoading(true);
    try {
      await api.patch(`/counts/${editTarget.id}`, { changes: editChanges, reason: editReason, editedBy: username }, headers);
      toast(`Count #${editTarget.id} updated`, 'success');
      setEditTarget(null);
      setEditChanges({});
      setEditReason('');
      loadCounts();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setEditLoading(false); }
  }

  // ─── Messages tab state ───────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadMessages() {
    if (!session) return;
    try {
      const data = await api.get<Message[]>(`/sessions/${session.id}/messages`, headers);
      setMessages(data);
    } catch { /**/ }
  }

  async function loadThread(target: number) {
    try {
      if (target === 0) {
        const msgs = await api.get<Message[]>(`/sessions/${session!.id}/messages/general`, headers);
        setThreadMessages(msgs);
      } else {
        const msgs = await api.get<Message[]>(`/counts/${target}/messages`);
        setThreadMessages(msgs);
      }
    } catch { /**/ }
  }

  useEffect(() => {
    if (tab === 'messages') {
      loadMessages();
      pollRef.current = setInterval(loadMessages, 6000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tab, session?.id]);

  // Auto-select first unanswered thread when messages load
  useEffect(() => {
    if (tab !== 'messages' || messages.length === 0 || replyTarget !== null) return;
    const threads = Object.keys(
      messages.reduce<Record<number, boolean>>((acc, m) => { acc[m.count_id ?? 0] = true; return acc; }, {})
    ).map(Number);
    const unanswered = threads.find((k) =>
      messages.some((m) => (m.count_id ?? 0) === k && m.role === 'counter') &&
      !messages.some((m) => (m.count_id ?? 0) === k && m.role === 'admin')
    );
    const first = unanswered ?? threads[0];
    if (first !== undefined) { setReplyTarget(first); loadThread(first); }
  }, [messages, tab]);

  // Refresh thread when replyTarget changes
  useEffect(() => {
    if (tab === 'messages' && replyTarget !== null) {
      loadThread(replyTarget);
    }
  }, [replyTarget]);

  async function handleReply() {
    if (replyTarget === null || !replyText.trim() || !session) return;
    try {
      if (replyTarget === 0) {
        await api.post(`/sessions/${session.id}/messages`, { sender: username, role, body: replyText }, headers);
      } else {
        await api.post(`/counts/${replyTarget}/messages`, { sender: username, role, body: replyText }, headers);
      }
      setReplyText('');
      loadThread(replyTarget);
      loadMessages();
    } catch { /**/ }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'review', label: 'Review' },
    { key: 'messages', label: 'Messages' },
  ];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`no-min-h px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-0.5 ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── REVIEW TAB ─── */}
        {tab === 'review' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input placeholder="Filter material…" value={filterMat} onChange={(e) => setFilterMat(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Filter SLOC…" value={filterSloc} onChange={(e) => setFilterSloc(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Filter user…" value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All statuses</option>
                <option value="pending">Counted</option>
                <option value="verified">Verified</option>
                <option value="flagged">Flagged</option>
              </select>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-3 text-left">ID</th>
                      <th className="px-3 py-3 text-left">User</th>
                      <th className="px-3 py-3 text-left">Material</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-left">SLOC</th>
                      <th className="px-3 py-3 text-left">Bin</th>
                      <th className="px-3 py-3 text-left">Status</th>
                      <th className="px-3 py-3 text-left">Time</th>
                      <th className="px-3 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loadingCounts ? (
                      <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
                    ) : counts.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No counts found</td></tr>
                    ) : counts.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">#{c.id}</td>
                        <td className="px-3 py-2 text-gray-700">{c.username}</td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-gray-800">{c.material_number}</div>
                          {c.material_description && <div className="text-xs text-gray-400 truncate max-w-[12rem]">{c.material_description}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800">{c.quantity}</td>
                        <td className="px-3 py-2 text-gray-600">{c.sloc}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{c.wm_bin || c.zbin || '—'}</td>
                        <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                        <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-center">
                            {c.status !== 'verified' && (
                              <Button size="sm" variant="success" className="no-min-h !min-h-0 px-2 py-1 text-xs" loading={verifyLoading === c.id} onClick={() => handleVerify(c)}>✓</Button>
                            )}
                            <Button size="sm" variant="secondary" className="no-min-h !min-h-0 px-2 py-1 text-xs" onClick={() => { setEditTarget(c); setEditChanges({}); setEditReason(''); }}>✎</Button>
                            {c.status !== 'flagged' && (
                              <Button size="sm" variant="danger" className="no-min-h !min-h-0 px-2 py-1 text-xs" onClick={() => { setFlagTarget(c); setFlagReason(''); }}>⚑</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
                {counts.length} record{counts.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}

        {/* ─── MESSAGES TAB ─── */}
        {tab === 'messages' && (() => {
          const threads = messages.reduce<Record<number, Message[]>>((acc, m) => {
            const key = m.count_id ?? 0;
            (acc[key] ??= []).push(m);
            return acc;
          }, {});
          const threadKeys = Object.keys(threads).map(Number);

          return (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Left: thread list */}
              <div className="lg:col-span-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700 text-sm">Conversations</h3>
                  <span className="text-xs text-gray-400">Auto-refreshes every 6s</span>
                </div>
                {threadKeys.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">No messages yet</div>
                ) : threadKeys.map((key) => {
                  const msgs = threads[key];
                  const last = msgs[msgs.length - 1];
                  const hasAdminReply = msgs.some((m) => m.role === 'admin');
                  const isSelected = replyTarget === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setReplyTarget(key)}
                      className={`cursor-pointer rounded-xl border p-3 transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : hasAdminReply ? 'border-gray-200 bg-white hover:border-blue-300' : 'border-amber-200 bg-amber-50 hover:border-amber-400'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-semibold ${key === 0 ? 'text-blue-600' : 'text-gray-500 font-mono'}`}>
                          {key === 0 ? 'General' : `Count #${key}${last.material_number ? ` · ${last.material_number}` : ''}`}
                        </span>
                        {!hasAdminReply && <span className="text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-medium">Needs reply</span>}
                      </div>
                      <p className="text-sm text-gray-700 truncate">{last.body}</p>
                      <span className="text-xs text-gray-400">{last.sender} · {formatDateTime(last.sent_at)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Right: thread + reply */}
              <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
                {replyTarget === null ? (
                  <div className="flex items-center justify-center h-48 text-sm text-gray-400">Select a conversation to reply</div>
                ) : (
                  <>
                    <h3 className="font-semibold text-gray-700 text-sm border-b border-gray-100 pb-2">
                      {replyTarget === 0 ? 'General Thread' : `Count #${replyTarget}${threads[replyTarget]?.[0]?.material_number ? ` — ${threads[replyTarget][0].material_number}` : ''}`}
                    </h3>
                    <div className="flex flex-col gap-2 flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
                      {threadMessages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`text-sm rounded-2xl px-4 py-2.5 max-w-[80%] ${m.role === 'admin' ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                            <div className={`text-xs font-medium mb-1 ${m.role === 'admin' ? 'text-purple-200' : 'text-gray-500'}`}>{m.sender}</div>
                            <div>{m.body}</div>
                            <div className={`text-xs mt-1 ${m.role === 'admin' ? 'text-purple-300' : 'text-gray-400'}`}>{formatDateTime(m.sent_at)}</div>
                          </div>
                        </div>
                      ))}
                      {threadMessages.length === 0 && <div className="text-sm text-gray-400 text-center py-6">No messages in this thread yet</div>}
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                        placeholder="Type reply and press Enter…"
                        className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <Button onClick={handleReply} disabled={!replyText.trim()}>Reply</Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Count #${editTarget?.id}`}>
        {editTarget && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
              <div><span className="text-gray-500">Material:</span> <span className="font-mono">{editTarget.material_number}</span></div>
              <div><span className="text-gray-500">Current Qty:</span> <span className="font-semibold">{editTarget.quantity}</span></div>
              <div><span className="text-gray-500">SLOC:</span> {editTarget.sloc}</div>
              <div><span className="text-gray-500">Status:</span> <StatusBadge status={editTarget.status} /></div>
            </div>
            <Input label="New Quantity" type="number" placeholder={String(editTarget.quantity)} onChange={(e) => setEditChanges((prev) => ({ ...prev, quantity: Number(e.target.value) }))} />
            <Input label="New WM Bin" placeholder={editTarget.wm_bin ?? ''} onChange={(e) => setEditChanges((prev) => ({ ...prev, wm_bin: e.target.value }))} />
            <Input label="New ZBIN" placeholder={editTarget.zbin ?? ''} onChange={(e) => setEditChanges((prev) => ({ ...prev, zbin: e.target.value }))} />
            <Textarea label="Reason for edit" required value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Explain why this count is being edited…" rows={3} />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleEdit} loading={editLoading}>Save Edit</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Flag dialog */}
      <Dialog open={!!flagTarget} onClose={() => setFlagTarget(null)} title={`Flag Count #${flagTarget?.id} for Recount`}>
        {flagTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">Counter will see this as flagged and know to recount.</p>
            <Textarea label="Reason" required value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="e.g. Quantity variance — please verify" rows={3} />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setFlagTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleFlag}>Flag for Recount</Button>
            </div>
          </div>
        )}
      </Dialog>
    </AppShell>
  );
}

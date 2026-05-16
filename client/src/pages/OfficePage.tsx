import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { StatusBadge } from '../components/ui/Badge';
import { MessageBubble } from '../components/count/MessageBubble';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { Count, Message, MessageThread } from '../types';

type Tab = 'review' | 'messages';

export function OfficePage() {
  const { username, role, session } = useSession();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'review';
  const [tab, setTab] = useState<Tab>(initialTab);

  const headers = { role: role ?? '', username };

  // Sync tab state with query param (allows linking to specific tab)
  useEffect(() => {
    const tabParam = searchParams.get('tab') as Tab | null;
    if (tabParam && tabParam !== tab) {
      setTab(tabParam);
    }
  }, [searchParams]);

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
  const [deleteCountTarget, setDeleteCountTarget] = useState<Count | null>(null);
  const [deleteCountLoading, setDeleteCountLoading] = useState(false);
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

  async function handleDeleteCount() {
    if (!deleteCountTarget) return;
    setDeleteCountLoading(true);
    try {
      await api.delete(`/counts/${deleteCountTarget.id}`, headers);
      toast(`Count #${deleteCountTarget.id} deleted`, 'success');
      setDeleteCountTarget(null);
      setEditTarget(null);
      loadCounts();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed to delete', 'error'); }
    finally { setDeleteCountLoading(false); }
  }

  // ─── Messages tab state ───────────────────────────────────────────────────
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadBottomRef = useRef<HTMLDivElement>(null);
  const officeInputRef = useRef<HTMLInputElement>(null);

  async function loadThreads() {
    if (!session) return;
    try {
      const data = await api.get<MessageThread[]>(`/sessions/${session.id}/threads`, headers);
      setThreads(data);
    } catch { /**/ }
  }

  async function loadThread(threadId: number) {
    try {
      const msgs = await api.get<Message[]>(`/threads/${threadId}/messages`);
      setThreadMessages(msgs);
    } catch { /**/ }
  }

  useEffect(() => {
    if (tab === 'messages') {
      loadThreads();
      pollRef.current = setInterval(() => {
        loadThreads();
        if (replyTarget !== null) loadThread(replyTarget);
      }, 6000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tab, session?.id]);

  useEffect(() => {
    if (tab !== 'messages' || threads.length === 0 || replyTarget !== null) return;
    const first = threads.find(t => !t.answered) ?? threads[0];
    if (first) { setReplyTarget(first.id); loadThread(first.id); }
  }, [threads, tab]);

  useEffect(() => {
    if (tab === 'messages' && replyTarget !== null) loadThread(replyTarget);
  }, [replyTarget]);

  useEffect(() => {
    threadBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  function scrollToMessage(msgId: number) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1', 'rounded-2xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1', 'rounded-2xl'), 1500);
    }
  }

  async function handleReply() {
    if (replyTarget === null || !replyText.trim()) return;
    try {
      await api.post(`/threads/${replyTarget}/messages`, {
        body: replyText,
        reply_to_id: replyingTo?.id ?? null,
      }, headers);
      setReplyText('');
      setReplyingTo(null);
      loadThread(replyTarget);
      loadThreads();
    } catch { /**/ }
  }

  async function handleDeleteMessage() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/messages/${deleteTarget.id}`);
      setThreadMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch { toast('Failed to delete message', 'error'); }
    finally { setDeleting(false); }
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
          const unansweredThreads = threads.filter(t => !t.answered);
          const answeredThreads = threads.filter(t => t.answered);
          const selectedThread = threads.find(t => t.id === replyTarget);

          return (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: 520 }}>
              {/* Left: thread list */}
              <div className="lg:col-span-2 flex flex-col gap-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700 text-sm">Questions</h3>
                  <span className="text-xs text-gray-400">Refreshes every 6s</span>
                </div>

                {unansweredThreads.length === 0 && answeredThreads.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">No questions yet</div>
                )}

                {unansweredThreads.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Needs reply</p>
                    {unansweredThreads.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setReplyTarget(t.id)}
                        className={`text-left rounded-xl border p-3 transition-colors ${replyTarget === t.id ? 'border-blue-500 bg-blue-50' : 'border-amber-200 bg-amber-50 hover:border-amber-400'}`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-semibold text-gray-800 truncate pr-2">{t.title}</span>
                          <span className="text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-medium shrink-0">Needs reply</span>
                        </div>
                        <span className="text-xs text-gray-500">{t.created_by} · {formatDateTime(t.created_at)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {answeredThreads.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Answered</p>
                    {answeredThreads.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setReplyTarget(t.id)}
                        className={`text-left rounded-xl border p-3 transition-colors text-sm ${replyTarget === t.id ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`}
                      >
                        <div className="font-medium text-gray-800 truncate">{t.title}</div>
                        <div className="text-xs text-green-600 mt-0.5">✓ {t.answered_by}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: thread + reply */}
              <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
                {!selectedThread ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400 p-8">Select a question to reply</div>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                      <h3 className="font-semibold text-gray-800 text-sm">{selectedThread.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selectedThread.created_by} · {formatDateTime(selectedThread.created_at)}
                        {selectedThread.answered && (
                          <span className="ml-2 text-green-600 font-medium">✓ Answered by {selectedThread.answered_by}</span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 flex-1 overflow-y-auto p-4" style={{ maxHeight: 340 }}>
                      {threadMessages.map((m) => (
                        <div key={m.id} className="group flex items-end gap-1">
                          <MessageBubble
                            message={m}
                            isOwn={m.role === 'admin'}
                            onReply={msg => { setReplyingTo(msg); officeInputRef.current?.focus(); }}
                            onScrollToMessage={scrollToMessage}
                          />
                          <button
                            onClick={() => setDeleteTarget(m)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 hover:text-red-500 shrink-0 text-base"
                            title="Delete message"
                          >🗑</button>
                        </div>
                      ))}
                      {threadMessages.length === 0 && <div className="text-sm text-gray-400 text-center py-6">No messages yet</div>}
                      <div ref={threadBottomRef} />
                    </div>

                    <div className="border-t border-gray-100 flex-shrink-0">
                      {replyingTo && (
                        <div className="flex items-start gap-2 px-4 pt-3 pb-1">
                          <div className="flex-1 border-l-4 border-purple-400 bg-purple-50 rounded px-3 py-1.5 min-w-0">
                            <p className="text-xs font-semibold text-purple-700">{replyingTo.sender}</p>
                            <p className="text-xs text-purple-600 truncate">{replyingTo.body}</p>
                          </div>
                          <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">×</button>
                        </div>
                      )}
                      <div className="flex gap-2 p-3">
                        <input
                          ref={officeInputRef}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                          placeholder={replyingTo ? `Replying to ${replyingTo.sender}…` : 'Type reply and press Enter…'}
                          className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <Button onClick={handleReply} disabled={!replyText.trim()}>Reply</Button>
                      </div>
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
            <div className="flex gap-2 justify-between">
              <Button variant="danger" onClick={() => setDeleteCountTarget(editTarget)}>Delete Record</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button onClick={handleEdit} loading={editLoading}>Save Edit</Button>
              </div>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteMessage}
        title="Delete message?"
        message={`This will permanently remove the message from ${deleteTarget?.sender ?? ''}. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      />

      <ConfirmDialog
        open={!!deleteCountTarget}
        onClose={() => setDeleteCountTarget(null)}
        onConfirm={handleDeleteCount}
        title={`Delete Count #${deleteCountTarget?.id}?`}
        message={`This will permanently delete the count for ${deleteCountTarget?.material_number ?? ''} (qty ${deleteCountTarget?.quantity ?? ''}) submitted by ${deleteCountTarget?.username ?? ''}. This cannot be undone.`}
        confirmLabel="Delete Record"
        confirmVariant="danger"
        loading={deleteCountLoading}
      />
    </AppShell>
  );
}

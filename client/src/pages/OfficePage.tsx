import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { StatusBadge, Badge } from '../components/ui/Badge';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { getSocket, joinSession } from '../lib/socket';
import { formatDateTime, formatCurrency } from '../lib/utils';
import type { Count, Message, SlocConfig, User, Role, InventorySession, WmBin, WmBinMaterial } from '../types';

type Tab = 'review' | 'messages' | 'data' | 'export' | 'config' | 'users' | 'wmbins';

export function OfficePage() {
  const { username, role, session, slocConfigs, setSlocConfigs } = useSession();
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

  // Socket real-time updates
  useEffect(() => {
    if (!session) return;
    joinSession(session.id);
    const socket = getSocket();
    const refresh = () => loadCounts();
    socket.on('count:created', refresh);
    socket.on('count:updated', refresh);
    socket.on('count:verified', refresh);
    socket.on('count:flagged', refresh);
    return () => { socket.off('count:created', refresh); socket.off('count:updated', refresh); socket.off('count:verified', refresh); socket.off('count:flagged', refresh); };
  }, [session?.id, loadCounts]);

  async function handleVerify(count: Count) {
    setVerifyLoading(count.id);
    try {
      await api.patch(`/counts/${count.id}/verify`, { verifiedBy: username }, headers);
      toast(`Count #${count.id} verified`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setVerifyLoading(null); }
  }

  async function handleFlag() {
    if (!flagTarget || !flagReason.trim()) { toast('Reason required', 'error'); return; }
    try {
      await api.patch(`/counts/${flagTarget.id}/flag`, { flaggedBy: username, reason: flagReason }, headers);
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
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setEditLoading(false); }
  }

  // ─── Messages tab state ───────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  // replyTarget: null = no thread selected, 0 = general thread, >0 = count_id
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);

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
        // General session thread
        const msgs = await api.get<Message[]>(`/sessions/${session!.id}/messages/general`, headers);
        setThreadMessages(msgs);
      } else {
        const msgs = await api.get<Message[]>(`/counts/${target}/messages`);
        setThreadMessages(msgs);
      }
    } catch { /**/ }
  }

  useEffect(() => {
    if (tab === 'messages') loadMessages();
  }, [tab]);

  // Auto-select first unanswered thread when messages load
  useEffect(() => {
    if (tab !== 'messages' || messages.length === 0 || replyTarget !== null) return;
    const threads = Object.keys(
      messages.reduce<Record<number, boolean>>((acc, m) => { acc[m.count_id ?? 0] = true; return acc; }, {})
    ).map(Number);
    // Prefer unanswered threads first
    const unanswered = threads.find((k) =>
      messages.some((m) => (m.count_id ?? 0) === k && m.role === 'counter') &&
      !messages.some((m) => (m.count_id ?? 0) === k && m.role === 'office')
    );
    const first = unanswered ?? threads[0];
    if (first !== undefined) { setReplyTarget(first); loadThread(first); }
  }, [messages, tab]);

  useEffect(() => {
    const socket = getSocket();
    socket.on('message:created', () => { loadMessages(); if (replyTarget !== null) loadThread(replyTarget); });
    return () => { socket.off('message:created'); };
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
    } catch { /**/ }
  }

  // ─── Import tab state ─────────────────────────────────────────────────────
  const [importStatus, setImportStatus] = useState<Record<string, { count: number; updated_at: string | null }>>({});
  const [importing, setImporting] = useState<string | null>(null);

  async function loadImportStatus() {
    try {
      const data = await api.get<typeof importStatus>('/imports/status', headers);
      setImportStatus(data);
    } catch { /**/ }
  }

  useEffect(() => { if (tab === 'data') loadImportStatus(); }, [tab]);

  async function handleImport(tableKey: string, endpoint: string, file: File, extra?: Record<string, string>) {
    setImporting(tableKey);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (extra) Object.entries(extra).forEach(([k, v]) => formData.append(k, v));
      const headers2: Record<string, string> = { 'x-role': role ?? '' };
      const res = await fetch(`/api${endpoint}`, { method: 'POST', body: formData, headers: headers2 });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json() as { imported: number };
      toast(`Imported ${result.imported} rows`, 'success');
      loadImportStatus();
    } catch (e) { toast(e instanceof Error ? e.message : 'Import failed', 'error'); }
    finally { setImporting(null); }
  }

  // ─── Export tab ───────────────────────────────────────────────────────────
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  function handleExport() {
    if (!session) return;
    const params = new URLSearchParams({ format: exportFormat });
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);
    window.open(`/api/sessions/${session.id}/export?${params}`, '_blank');
  }

  // ─── SLOC Config tab ─────────────────────────────────────────────────────
  const [newSloc, setNewSloc] = useState('');
  const [newSlocDesc, setNewSlocDesc] = useState('');
  const [newWm, setNewWm] = useState(false);
  const [newIm, setNewIm] = useState(false);
  const [savingSloc, setSavingSloc] = useState(false);

  async function handleSaveSloc() {
    if (!newSloc.trim()) { toast('SLOC required', 'error'); return; }
    setSavingSloc(true);
    try {
      await api.post('/sloc-config', { sloc: newSloc.trim().toUpperCase(), description: newSlocDesc || null, wm_enabled: newWm, im_enabled: newIm }, headers);
      toast('SLOC saved', 'success');
      setNewSloc(''); setNewSlocDesc(''); setNewWm(false); setNewIm(false);
      const configs = await api.get<SlocConfig[]>('/sloc-config');
      setSlocConfigs(configs);
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setSavingSloc(false); }
  }

  async function handleDeleteSloc(sloc: string) {
    try {
      await api.delete(`/sloc-config/${sloc}`, headers);
      const configs = await api.get<SlocConfig[]>('/sloc-config');
      setSlocConfigs(configs);
      toast(`SLOC ${sloc} removed`, 'success');
    } catch { toast('Failed to remove', 'error'); }
  }

  // ─── Users tab state ──────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [allSessions, setAllSessions] = useState<InventorySession[]>([]);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('counter');
  const [addingUser, setAddingUser] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  async function loadUsers() {
    try { setUsers(await api.get<User[]>('/users', headers)); } catch { /**/ }
  }
  async function loadAllSessions() {
    try { setAllSessions(await api.get<InventorySession[]>('/sessions')); } catch { /**/ }
  }

  useEffect(() => { if (tab === 'users') { loadUsers(); loadAllSessions(); } }, [tab]);

  async function handleAddUser() {
    if (!newUsername.trim()) { toast('Username required', 'error'); return; }
    setAddingUser(true);
    try {
      await api.post('/users', { username: newUsername.trim(), role: newUserRole }, headers);
      toast(`${newUsername} added as ${newUserRole}`, 'success');
      setAddUserOpen(false); setNewUsername(''); setNewUserRole('counter');
      loadUsers();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setAddingUser(false); }
  }

  async function handleDeleteUser() {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      await api.delete(`/users/${deleteUserTarget.id}`, headers);
      toast(`${deleteUserTarget.username} removed`, 'success');
      setDeleteUserTarget(null); loadUsers();
    } catch { toast('Failed to remove user', 'error'); }
    finally { setDeletingUser(false); }
  }

  async function handleUserRoleChange(user: User, newRole: string) {
    try {
      await api.patch(`/users/${user.id}`, { role: newRole }, headers);
      toast(`${user.username} updated to ${newRole}`, 'success'); loadUsers();
    } catch { toast('Failed to update role', 'error'); }
  }

  async function handleCreateSession() {
    if (!newSessionName.trim()) { toast('Session name required', 'error'); return; }
    setCreatingSession(true);
    try {
      await api.post('/sessions', { name: newSessionName.trim() }, headers);
      toast('Session created', 'success'); setNewSessionName(''); loadAllSessions();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setCreatingSession(false); }
  }

  async function handleCloseSession(s: InventorySession) {
    try {
      await api.patch(`/sessions/${s.id}/close`, {}, headers);
      toast(`"${s.name}" closed`, 'success'); loadAllSessions();
    } catch { toast('Failed to close session', 'error'); }
  }

  const ROLE_OPTIONS = [
    { value: 'counter', label: 'Counter' },
    { value: 'office', label: 'Office' },
    { value: 'admin', label: 'Admin' },
  ];

  // ─── WM Bins tab state ────────────────────────────────────────────────────
  const [wmBins, setWmBins] = useState<WmBin[]>([]);
  const [wmBinMaterials, setWmBinMaterials] = useState<Record<number, WmBinMaterial[]>>({});
  const [selectedBin, setSelectedBin] = useState<WmBin | null>(null);
  const [wmFilterSloc, setWmFilterSloc] = useState('');
  const [wmFilterType, setWmFilterType] = useState('');
  const [newBin, setNewBin] = useState('');
  const [newBinSloc, setNewBinSloc] = useState('');
  const [newBinType, setNewBinType] = useState<'100' | '200'>('100');
  const [newBinDesc, setNewBinDesc] = useState('');
  const [addingBin, setAddingBin] = useState(false);
  const [newMatForBin, setNewMatForBin] = useState('');
  const [addingMat, setAddingMat] = useState(false);

  async function loadWmBins() {
    try {
      const params = new URLSearchParams();
      if (wmFilterSloc) params.set('sloc', wmFilterSloc);
      if (wmFilterType) params.set('storage_type', wmFilterType);
      const data = await api.get<WmBin[]>(`/wm-bins?${params}`, headers);
      setWmBins(data);
    } catch { /**/ }
  }

  async function loadBinMaterials(binId: number) {
    try {
      const data = await api.get<WmBinMaterial[]>(`/wm-bins/${binId}/materials`);
      setWmBinMaterials((prev) => ({ ...prev, [binId]: data }));
    } catch { /**/ }
  }

  useEffect(() => { if (tab === 'wmbins') loadWmBins(); }, [tab, wmFilterSloc, wmFilterType]);

  useEffect(() => {
    if (selectedBin) loadBinMaterials(selectedBin.id);
  }, [selectedBin?.id]);

  async function handleAddBin() {
    if (!newBin.trim() || !newBinSloc.trim()) { toast('Bin and SLOC are required', 'error'); return; }
    setAddingBin(true);
    try {
      await api.post('/wm-bins', { bin: newBin, storage_type: newBinType, sloc: newBinSloc, description: newBinDesc || undefined }, headers);
      toast('Bin added', 'success');
      setNewBin(''); setNewBinDesc('');
      loadWmBins();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setAddingBin(false); }
  }

  async function handleDeleteBin(bin: WmBin) {
    try {
      await api.delete(`/wm-bins/${bin.id}`, headers);
      toast(`Bin ${bin.bin} deleted`, 'success');
      if (selectedBin?.id === bin.id) setSelectedBin(null);
      loadWmBins();
    } catch { toast('Failed to delete bin', 'error'); }
  }

  async function handleAddMaterial() {
    if (!selectedBin || !newMatForBin.trim()) return;
    setAddingMat(true);
    try {
      await api.post(`/wm-bins/${selectedBin.id}/materials`, { material_number: newMatForBin }, headers);
      toast(`${newMatForBin.toUpperCase()} linked`, 'success');
      setNewMatForBin('');
      loadBinMaterials(selectedBin.id);
      loadWmBins();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setAddingMat(false); }
  }

  async function handleRemoveMaterial(matNum: string) {
    if (!selectedBin) return;
    try {
      await api.delete(`/wm-bins/${selectedBin.id}/materials/${matNum}`, headers);
      toast('Material unlinked', 'success');
      loadBinMaterials(selectedBin.id);
      loadWmBins();
    } catch { toast('Failed', 'error'); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'review', label: 'Review' },
    { key: 'messages', label: 'Messages' },
    { key: 'data', label: 'SAP Data' },
    { key: 'export', label: 'Export' },
    { key: 'config', label: 'SLOC Config' },
    { key: 'wmbins', label: 'WM Bins' },
    { key: 'users', label: 'Users & Sessions' },
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
            {/* Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input placeholder="Filter material…" value={filterMat} onChange={(e) => setFilterMat(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Filter SLOC…" value={filterSloc} onChange={(e) => setFilterSloc(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Filter user…" value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="flagged">Flagged</option>
              </select>
            </div>

            {/* Table */}
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
          // Build threads: key 0 = general, key N = count_id N
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
                  <button className="no-min-h text-xs text-blue-600 hover:underline" onClick={loadMessages}>↻ Refresh</button>
                </div>
                {threadKeys.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">No messages yet</div>
                ) : threadKeys.map((key) => {
                  const msgs = threads[key];
                  const last = msgs[msgs.length - 1];
                  const hasOfficeReply = msgs.some((m) => m.role === 'office');
                  const isSelected = replyTarget === key;
                  return (
                    <div
                      key={key}
                      onClick={() => { setReplyTarget(key); loadThread(key); }}
                      className={`cursor-pointer rounded-xl border p-3 transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : hasOfficeReply ? 'border-gray-200 bg-white hover:border-blue-300' : 'border-amber-200 bg-amber-50 hover:border-amber-400'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-semibold ${key === 0 ? 'text-blue-600' : 'text-gray-500 font-mono'}`}>
                          {key === 0 ? 'General Question' : `Count #${key} · ${last.material_number ?? ''}`}
                        </span>
                        {!hasOfficeReply && <span className="text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-medium">Needs reply</span>}
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
                      {replyTarget === 0 ? 'General Question Thread' : `Count #${replyTarget}${threads[replyTarget]?.[0]?.material_number ? ` — ${threads[replyTarget][0].material_number}` : ''}`}
                    </h3>
                    <div className="flex flex-col gap-2 flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
                      {threadMessages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'office' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`text-sm rounded-2xl px-4 py-2.5 max-w-[80%] ${m.role === 'office' ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                            <div className={`text-xs font-medium mb-1 ${m.role === 'office' ? 'text-purple-200' : 'text-gray-500'}`}>{m.sender}</div>
                            <div>{m.body}</div>
                            <div className={`text-xs mt-1 ${m.role === 'office' ? 'text-purple-300' : 'text-gray-400'}`}>{formatDateTime(m.sent_at)}</div>
                          </div>
                        </div>
                      ))}
                      {threadMessages.length === 0 && <div className="text-sm text-gray-400 text-center py-6">Loading thread…</div>}
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

        {/* ─── SAP DATA TAB ─── */}
        {tab === 'data' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'materials', label: 'MARA / MAKT (Materials)', endpoint: '/imports/materials', tableKey: 'sap_materials' },
              { key: 'plant_data', label: 'MARC (Plant Data)', endpoint: '/imports/plant-data', tableKey: 'sap_plant_data' },
              { key: 'valuation', label: 'MBEW (Valuation)', endpoint: '/imports/valuation', tableKey: 'sap_valuation' },
            ].map((imp) => (
              <Card key={imp.key}>
                <CardHeader><h3 className="font-semibold text-gray-700 text-sm">{imp.label}</h3></CardHeader>
                <CardBody className="flex flex-col gap-2">
                  {importStatus[imp.tableKey] && (
                    <p className="text-xs text-gray-500">{importStatus[imp.tableKey].count} rows · Updated {importStatus[imp.tableKey].updated_at ? formatDateTime(importStatus[imp.tableKey].updated_at!) : 'never'}</p>
                  )}
                  <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === imp.key ? 'opacity-50 pointer-events-none' : ''}`}>
                    {importing === imp.key ? '⟳ Importing…' : '↑ Upload CSV or XLSX'}
                    <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(imp.key, imp.endpoint, file);
                      e.target.value = '';
                    }} />
                  </label>
                </CardBody>
              </Card>
            ))}

            {/* Snapshot */}
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">SAP Inventory Snapshot</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                <p className="text-xs text-gray-500">Stock on hand at inventory freeze date. Used for variance comparison.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-blue-400 cursor-pointer text-sm text-blue-600 hover:bg-blue-50 ${importing === 'snapshot' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'snapshot' ? '⟳ Importing…' : '↑ Upload Snapshot CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && session) handleImport('snapshot', `/imports/snapshot`, file, { sessionId: String(session.id) });
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>
          </div>
        )}

        {/* ─── EXPORT TAB ─── */}
        {tab === 'export' && (
          <Card className="max-w-md">
            <CardHeader><h3 className="font-semibold text-gray-700">Export Count Data</h3></CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Select
                label="Format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                options={[
                  { value: 'csv', label: 'CSV — Comma Separated Values' },
                  { value: 'tsv', label: 'TSV — Tab Separated Values' },
                  { value: 'xlsx', label: 'XLSX — Excel Workbook' },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="From date" type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
                <Input label="To date" type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
              </div>
              <p className="text-xs text-gray-500">Photos and messages are excluded from export. Includes material descriptions from SAP master data if loaded.</p>
              <Button onClick={handleExport} size="lg">
                ↓ Download {exportFormat.toUpperCase()}
              </Button>
            </CardBody>
          </Card>
        )}

        {/* ─── SLOC CONFIG TAB ─── */}
        {tab === 'config' && (
          <div className="flex flex-col gap-4 max-w-2xl">
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700">Add / Update SLOC</h3></CardHeader>
              <CardBody className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="SLOC Code" value={newSloc} onChange={(e) => setNewSloc(e.target.value.toUpperCase())} placeholder="e.g. 0001" />
                  <Input label="Description" value={newSlocDesc} onChange={(e) => setNewSlocDesc(e.target.value)} placeholder="e.g. Main Warehouse" />
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newWm} onChange={(e) => setNewWm(e.target.checked)} className="w-4 h-4 rounded" />
                    WM Enabled (requires WM Bin)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newIm} onChange={(e) => setNewIm(e.target.checked)} className="w-4 h-4 rounded" />
                    IM Only (requires ZBIN)
                  </label>
                </div>
                <Button onClick={handleSaveSloc} loading={savingSloc}>Save SLOC</Button>
              </CardBody>
            </Card>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-3 text-left">SLOC</th>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3 text-center">WM</th>
                    <th className="px-3 py-3 text-center">IM/ZBIN</th>
                    <th className="px-3 py-3 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {slocConfigs.map((c) => (
                    <tr key={c.sloc} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono font-semibold text-gray-800">{c.sloc}</td>
                      <td className="px-3 py-2 text-gray-600">{c.description || '—'}</td>
                      <td className="px-3 py-2 text-center">{c.wm_enabled ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center">{c.im_enabled ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="sm" className="no-min-h !min-h-0 p-1 text-red-400 hover:text-red-600" onClick={() => handleDeleteSloc(c.sloc)}>✕</Button>
                      </td>
                    </tr>
                  ))}
                  {slocConfigs.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No SLOCs configured yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── USERS & SESSIONS TAB ─── */}
        {tab === 'users' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            {/* Sessions */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-700">Inventory Sessions</h3>
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="New session name (e.g. Q2 2026 Annual Count)"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
                  />
                  <Button onClick={handleCreateSession} loading={creatingSession}>Create</Button>
                </div>
                {allSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{s.name}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.status}
                      </span>
                    </div>
                    {s.status === 'open' && (
                      <Button variant="secondary" size="sm" onClick={() => handleCloseSession(s)}>Close</Button>
                    )}
                  </div>
                ))}
                {allSessions.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No sessions yet</p>}
              </CardBody>
            </Card>

            {/* Users */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700">Users</h3>
                  <Button size="sm" onClick={() => setAddUserOpen(true)}>+ Add User</Button>
                </div>
              </CardHeader>
              <CardBody className="flex flex-col gap-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-gray-800">{u.username}</span>
                    <select
                      value={u.role}
                      onChange={(e) => handleUserRoleChange(u, e.target.value)}
                      className="no-min-h text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.role === 'counter' ? 'bg-blue-100 text-blue-800' : u.role === 'office' ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>
                      {u.role}
                    </span>
                    <Button variant="ghost" size="sm" className="no-min-h !min-h-0 p-1 text-red-400 hover:text-red-600" onClick={() => setDeleteUserTarget(u)}>✕</Button>
                  </div>
                ))}
                {users.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No users yet</p>}
              </CardBody>
            </Card>
          </div>
        )}

        {/* ─── WM BINS TAB ─── */}
        {tab === 'wmbins' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Left: bin list + add form */}
            <div className="lg:col-span-2 flex flex-col gap-3">

              {/* Add bin form */}
              <Card>
                <CardHeader><h3 className="font-semibold text-gray-700 text-sm">Add New Bin</h3></CardHeader>
                <CardBody className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Bin</label>
                      <input
                        value={newBin}
                        onChange={(e) => setNewBin(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddBin()}
                        placeholder="e.g. A-01-01"
                        className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">SLOC</label>
                      <input
                        value={newBinSloc}
                        onChange={(e) => setNewBinSloc(e.target.value.toUpperCase())}
                        placeholder="e.g. 0001"
                        className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Storage Type</label>
                    <select
                      value={newBinType}
                      onChange={(e) => setNewBinType(e.target.value as '100' | '200')}
                      className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="100">100 — Fixed Bin</option>
                      <option value="200">200 — Secondary Bin</option>
                    </select>
                  </div>
                  <input
                    value={newBinDesc}
                    onChange={(e) => setNewBinDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button onClick={handleAddBin} loading={addingBin}>Add Bin</Button>
                </CardBody>
              </Card>

              {/* Filters */}
              <div className="flex gap-2">
                <input
                  value={wmFilterSloc}
                  onChange={(e) => setWmFilterSloc(e.target.value.toUpperCase())}
                  placeholder="Filter SLOC…"
                  className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={wmFilterType}
                  onChange={(e) => setWmFilterType(e.target.value)}
                  className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All types</option>
                  <option value="100">100 – Fixed</option>
                  <option value="200">200 – Secondary</option>
                </select>
              </div>

              {/* Bin list */}
              <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 480 }}>
                {wmBins.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">No bins configured yet</div>
                ) : wmBins.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBin(b)}
                    className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors flex items-center gap-2 ${selectedBin?.id === b.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-800">{b.bin}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${b.storage_type === '100' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                          {b.storage_type === '100' ? 'Fixed' : 'Secondary'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">{b.sloc}{b.description ? ` · ${b.description}` : ''} · {b.material_count} material{b.material_count !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBin(b); }}
                      className="no-min-h p-1 text-red-400 hover:text-red-600 text-sm"
                      title="Delete bin"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: bin detail + material management */}
            <div className="lg:col-span-3">
              {!selectedBin ? (
                <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-64 text-sm text-gray-400">
                  Select a bin to manage its materials
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-gray-800 text-base">{selectedBin.bin}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded font-medium ${selectedBin.storage_type === '100' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                          Storage Type {selectedBin.storage_type} — {selectedBin.storage_type === '100' ? 'Fixed Bin' : 'Secondary Bin'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">SLOC: {selectedBin.sloc}</span>
                    </div>
                    {selectedBin.description && <p className="text-xs text-gray-500 mt-1">{selectedBin.description}</p>}
                  </CardHeader>
                  <CardBody className="flex flex-col gap-3">
                    {selectedBin.storage_type === '100' && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        Fixed bin — materials listed here are assigned to this bin as their primary location (storage type 100 strategy).
                      </p>
                    )}
                    {selectedBin.storage_type === '200' && (
                      <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
                        Secondary bin — materials listed here may overflow into this bin when the fixed bin is full.
                      </p>
                    )}

                    {/* Add material */}
                    <div className="flex gap-2">
                      <input
                        value={newMatForBin}
                        onChange={(e) => setNewMatForBin(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddMaterial()}
                        placeholder="Material number to link…"
                        className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <Button onClick={handleAddMaterial} loading={addingMat} disabled={!newMatForBin.trim()}>Link</Button>
                    </div>

                    {/* Material list */}
                    <div className="flex flex-col gap-1">
                      {(wmBinMaterials[selectedBin.id] ?? []).length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                          No materials linked to this bin yet
                        </div>
                      ) : (wmBinMaterials[selectedBin.id] ?? []).map((m) => (
                        <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                          <span className="font-mono text-sm font-semibold text-gray-800 flex-shrink-0">{m.material_number}</span>
                          <span className="flex-1 text-xs text-gray-500 truncate">{m.material_description ?? '—'}</span>
                          <button
                            onClick={() => handleRemoveMaterial(m.material_number)}
                            className="no-min-h p-1 text-red-400 hover:text-red-600 text-sm flex-shrink-0"
                            title="Unlink material"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add user dialog */}
      <Dialog open={addUserOpen} onClose={() => setAddUserOpen(false)} title="Add User">
        <div className="flex flex-col gap-4">
          <Input label="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. jsmith" />
          <Select label="Role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as Role)} options={ROLE_OPTIONS} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} loading={addingUser}>Add User</Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!deleteUserTarget}
        onClose={() => setDeleteUserTarget(null)}
        onConfirm={handleDeleteUser}
        title="Remove User"
        message={`Remove "${deleteUserTarget?.username}"? They will no longer be able to sign in.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={deletingUser}
      />

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

import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { User, Role, InventorySession, SlocConfig } from '../types';

type Tab = 'users' | 'data' | 'export' | 'config';

const ROLE_OPTIONS = [
  { value: 'counter', label: 'Counter' },
  { value: 'admin', label: 'Admin' },
];

function isOnline(lastActive: string | null): boolean {
  if (!lastActive) return false;
  const diff = (Date.now() - new Date(lastActive + 'Z').getTime()) / 1000 / 60;
  return diff < 10;
}

function formatLastActive(lastActive: string | null): string {
  if (!lastActive) return 'Never';
  const diff = (Date.now() - new Date(lastActive + 'Z').getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDateTime(lastActive);
}

export function AdminPage() {
  const { role, username, session, slocConfigs, setSlocConfigs } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('users');

  const headers = { role: role ?? '', username };

  // ─── Users & Sessions tab ─────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [allSessions, setAllSessions] = useState<InventorySession[]>([]);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
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

  useEffect(() => {
    if (tab === 'users') { loadUsers(); loadAllSessions(); }
  }, [tab]);

  // Refresh online status every 30s while on users tab
  useEffect(() => {
    if (tab !== 'users') return;
    const id = setInterval(loadUsers, 30000);
    return () => clearInterval(id);
  }, [tab]);

  async function handleAddUser() {
    if (!newUsername.trim()) { toast('Username required', 'error'); return; }
    setAddingUser(true);
    try {
      const pwd = newUserPassword || (newUserRole === 'admin' ? 'StopGap' : '');
      await api.post('/users', { username: newUsername.trim(), role: newUserRole, password: pwd }, headers);
      toast(`${newUsername} added as ${newUserRole}`, 'success');
      setAddUserOpen(false); setNewUsername(''); setNewUserPassword(''); setNewUserRole('counter');
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

  // ─── SAP Data tab ─────────────────────────────────────────────────────────
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
      const res = await fetch(`/api${endpoint}`, { method: 'POST', body: formData, headers: { 'x-role': role ?? '' } });
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

  // ─── SLOC Config tab ──────────────────────────────────────────────────────
  const [availableSlocs, setAvailableSlocs] = useState<SlocConfig[]>([]);
  const [togglingSloc, setTogglingSloc] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'config') loadAvailableSlocs();
  }, [tab]);

  async function loadAvailableSlocs() {
    try {
      const data = await api.get<SlocConfig[]>('/sloc-config/available');
      setAvailableSlocs(data);
    } catch { /**/ }
  }

  async function handleToggleSetting(sloc: string, field: 'wm_enabled' | 'im_enabled') {
    const current = availableSlocs.find(s => s.sloc === sloc);
    if (!current) return;
    setTogglingSloc(sloc);
    try {
      const newVal = field === 'wm_enabled' ? !current.wm_enabled : !current.im_enabled;
      const update: any = { description: current.description };
      update[field] = newVal;
      if (field === 'wm_enabled') update.im_enabled = current.im_enabled;
      else update.wm_enabled = current.wm_enabled;

      await api.patch(`/sloc-config/${sloc}`, update, headers);
      await loadAvailableSlocs();
      toast(`${sloc} updated`, 'success');
    } catch { toast('Failed to update', 'error'); }
    finally { setTogglingSloc(null); }
  }

  async function handleDeleteSloc(sloc: string) {
    try {
      await api.delete(`/sloc-config/${sloc}`, headers);
      await loadAvailableSlocs();
      toast(`SLOC ${sloc} removed`, 'success');
    } catch { toast('Failed to remove', 'error'); }
  }

const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Users & Sessions' },
    { key: 'data', label: 'SAP Data' },
    { key: 'export', label: 'Export' },
    { key: 'config', label: 'SLOC Config' },
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
                      {s.created_at && <span className="ml-2 text-xs text-gray-400">Created {formatDateTime(s.created_at)}</span>}
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
                {users.map((u) => {
                  const online = isOnline(u.last_active);
                  const roleBg = u.role === 'counter' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800';
                  return (
                    <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      {/* Online dot */}
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={online ? 'Online (active in last 10 min)' : 'Offline'}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800">{u.username}</div>
                        <div className="text-xs text-gray-400">
                          {online ? <span className="text-green-600 font-medium">Online</span> : formatLastActive(u.last_active)}
                        </div>
                      </div>
                      <select
                        value={u.role}
                        onChange={(e) => handleUserRoleChange(u, e.target.value)}
                        className="no-min-h text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBg}`}>
                        {u.role}
                      </span>
                      <Button variant="ghost" size="sm" className="no-min-h !min-h-0 p-1 text-red-400 hover:text-red-600" onClick={() => setDeleteUserTarget(u)}>✕</Button>
                    </div>
                  );
                })}
                {users.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No users yet</p>}
              </CardBody>
            </Card>
          </div>
        )}

        {/* ─── SAP DATA TAB ─── */}
        {tab === 'data' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'mara', label: 'MARA (Material Master)', endpoint: '/imports/mara', tableKey: 'sap_materials' },
              { key: 'makt', label: 'MAKT (Material Descriptions)', endpoint: '/imports/makt', tableKey: 'sap_materials' },
              { key: 'plant_data', label: 'MARC (Plant Data)', endpoint: '/imports/plant-data', tableKey: 'sap_plant_data' },
              { key: 'valuation', label: 'MBEW (Valuation)', endpoint: '/imports/valuation', tableKey: 'sap_valuation' },
              { key: 'mlgt', label: 'MLGT (Material Ledger GL)', endpoint: '/imports/mlgt', tableKey: 'sap_mlgt' },
              { key: 'mlgn', label: 'MLGN (Material Ledger Items)', endpoint: '/imports/mlgn', tableKey: 'sap_mlgn' },
              { key: 'lqua', label: 'LQUA (Warehouse Stock)', endpoint: '/imports/lqua', tableKey: 'sap_lqua' },
            ].map((imp) => (
              <Card key={imp.key}>
                <CardHeader><h3 className="font-semibold text-gray-700 text-sm">{imp.label}</h3></CardHeader>
                <CardBody className="flex flex-col gap-2">
                  {importStatus[imp.tableKey] ? (
                    <div className="bg-blue-50 rounded px-2 py-1 mb-1">
                      <p className="text-xs font-medium text-blue-900">
                        📊 Records Loaded: <span className="font-bold text-blue-700">{importStatus[imp.tableKey].count.toLocaleString()}</span>
                      </p>
                      <p className="text-xs text-blue-700">
                        ⏰ Last Loaded: <span className="font-mono">{importStatus[imp.tableKey].updated_at ? formatDateTime(importStatus[imp.tableKey].updated_at!) : 'Never'}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded px-2 py-1 mb-1">
                      <p className="text-xs text-gray-600">No data loaded yet</p>
                    </div>
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

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">MARD (Warehouse Stock)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_mard'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_mard'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_mard'].updated_at ? formatDateTime(importStatus['sap_mard'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">Material warehouse stock at plant/storage location level. From SAP table MARD (T300).</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'mard' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'mard' ? '⟳ Importing…' : '↑ Upload MARD CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('mard', '/imports/mard', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">T300T (Storage Locations)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_storage_locations'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_storage_locations'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_storage_locations'].updated_at ? formatDateTime(importStatus['sap_storage_locations'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">SAP warehouse storage location master data. Columns: LGORT, WERKS, LGOBE, LOTYP.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'storage_locations' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'storage_locations' ? '⟳ Importing…' : '↑ Upload CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('storage_locations', '/imports/storage-locations', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">MSEG (Material Movements)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_mseg'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_mseg'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_mseg'].updated_at ? formatDateTime(importStatus['sap_mseg'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">Material movements (201/202 receipt, 221/222 usage, 309 transfers, 911/912 adjustments). Identifies high-issue materials.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'mseg' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'mseg' ? '⟳ Importing…' : '↑ Upload MSEG CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('mseg', '/imports/mseg', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">LGAP (Storage Bins)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_lgap'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_lgap'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_lgap'].updated_at ? formatDateTime(importStatus['sap_lgap'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">SAP warehouse storage bin master data. All bins created in the warehouse system.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'lgap' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'lgap' ? '⟳ Importing…' : '↑ Upload LGAP CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('lgap', '/imports/lgap', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">EKKO (PO Headers)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_ekko'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_ekko'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_ekko'].updated_at ? formatDateTime(importStatus['sap_ekko'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">Purchase order headers (EKKO). Key columns: EBELN, BSTYP, BSART, LIFNR, EKGRP, BEDAT. Any additional columns are stored automatically.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'ekko' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'ekko' ? '⟳ Importing…' : '↑ Upload EKKO CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('ekko', '/imports/ekko', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">EKPO (PO Line Items)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_ekpo'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_ekpo'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_ekpo'].updated_at ? formatDateTime(importStatus['sap_ekpo'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">Purchase order line items (EKPO). Key columns: EBELN, EBELP, MATNR, MENGE, MEINS, WERKS, LGORT, ELIKZ. Paired with MSEG to detect open PO quantities.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'ekpo' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'ekpo' ? '⟳ Importing…' : '↑ Upload EKPO CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('ekpo', '/imports/ekpo', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">AUFK (Production / Process Orders)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_aufk'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_aufk'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_aufk'].updated_at ? formatDateTime(importStatus['sap_aufk'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">Production/process orders (AUFK + AFKO). Key columns: AUFNR, AUART, MATNR, GAMNG, WEMNG, SYSST, WERKS, LGORT. Export from CO03 or use a custom report.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'aufk' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'aufk' ? '⟳ Importing…' : '↑ Upload AUFK CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('aufk', '/imports/aufk', file);
                    e.target.value = '';
                  }} />
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">RESB (Reservations)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_resb'] ? (
                  <div className="bg-blue-50 rounded px-2 py-1">
                    <p className="text-xs font-medium text-blue-900">📊 Records: <span className="font-bold">{importStatus['sap_resb'].count.toLocaleString()}</span></p>
                    <p className="text-xs text-blue-700">⏰ Last: {importStatus['sap_resb'].updated_at ? formatDateTime(importStatus['sap_resb'].updated_at!) : 'Never'}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">No data loaded yet</div>
                )}
                <p className="text-xs text-gray-500">Open reservations and dependent requirements (RESB). Key columns: RSNUM, RSPOS, MATNR, BDMNG, ENMNG, AUFNR, KZEAR. Export from MB25 or MB21.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'resb' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'resb' ? '⟳ Importing…' : '↑ Upload RESB CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('resb', '/imports/resb', file);
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
              <Button onClick={handleExport} size="lg">↓ Download {exportFormat.toUpperCase()}</Button>
            </CardBody>
          </Card>
        )}

        {/* ─── SLOC CONFIG TAB ─── */}
        {tab === 'config' && (
          <div className="flex flex-col gap-4 max-w-4xl">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <strong>SLOCs from T300T:</strong> Import from SAP Data tab, then toggle WM/IM settings below
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">SLOC</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-center min-w-[120px]">WM</th>
                    <th className="px-4 py-3 text-center min-w-[120px]">IM</th>
                    <th className="px-4 py-3 text-center min-w-[60px]">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {availableSlocs.map((s) => (
                    <tr key={s.sloc} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800">{s.sloc}</td>
                      <td className="px-4 py-3 text-gray-600">{s.description || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleSetting(s.sloc, 'wm_enabled')} disabled={togglingSloc === s.sloc} className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors ${s.wm_enabled ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200' : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200'} ${togglingSloc === s.sloc ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`} title={s.wm_enabled ? 'Disable WM' : 'Enable WM'}>
                          {togglingSloc === s.sloc ? '⟳' : s.wm_enabled ? '✓' : '−'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleSetting(s.sloc, 'im_enabled')} disabled={togglingSloc === s.sloc} className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors ${s.im_enabled ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200'} ${togglingSloc === s.sloc ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`} title={s.im_enabled ? 'Disable IM' : 'Enable IM'}>
                          {togglingSloc === s.sloc ? '⟳' : s.im_enabled ? '✓' : '−'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDeleteSloc(s.sloc)} disabled={togglingSloc === s.sloc} className="inline-flex items-center justify-center w-8 h-8 rounded text-red-400 hover:text-red-600 disabled:opacity-50">✕</button>
                      </td>
                    </tr>
                  ))}
                  {availableSlocs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No SLOCs available. Import T300T data first.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Add user dialog */}
      <Dialog open={addUserOpen} onClose={() => setAddUserOpen(false)} title="Add User">
        <div className="flex flex-col gap-4">
          <Input label="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. jsmith" />
          <Select label="Role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as Role)} options={ROLE_OPTIONS} />
          <Input
            label="Password (optional)"
            type="password"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            placeholder={newUserRole === 'admin' ? 'Leave blank for default (StopGap)' : 'Leave blank for no password'}
          />
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
    </AppShell>
  );
}

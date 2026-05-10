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
import type { User, Role, InventorySession, SlocConfig, WmBin, WmBinMaterial } from '../types';

type Tab = 'users' | 'data' | 'export' | 'config' | 'wmbins';

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

  // ─── WM Bins tab ──────────────────────────────────────────────────────────
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
  useEffect(() => { if (selectedBin) loadBinMaterials(selectedBin.id); }, [selectedBin?.id]);

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
    { key: 'users', label: 'Users & Sessions' },
    { key: 'data', label: 'SAP Data' },
    { key: 'export', label: 'Export' },
    { key: 'config', label: 'SLOC Config' },
    { key: 'wmbins', label: 'WM Bins' },
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
              { key: 'materials', label: 'MARA / MAKT (Materials)', endpoint: '/imports/materials', tableKey: 'sap_materials' },
              { key: 'plant_data', label: 'MARC (Plant Data)', endpoint: '/imports/plant-data', tableKey: 'sap_plant_data' },
              { key: 'valuation', label: 'MBEW (Valuation)', endpoint: '/imports/valuation', tableKey: 'sap_valuation' },
              { key: 'mlgt', label: 'MLGT (Material Ledger GL)', endpoint: '/imports/mlgt', tableKey: 'sap_mlgt' },
              { key: 'mlgn', label: 'MLGN (Material Ledger Items)', endpoint: '/imports/mlgn', tableKey: 'sap_mlgn' },
              { key: 'lqua', label: 'LQUA (Warehouse Stock)', endpoint: '/imports/lqua', tableKey: 'sap_lqua' },
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

            <Card>
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">MARD (Warehouse Stock)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['sap_mard'] && (
                  <p className="text-xs text-gray-500">{importStatus['sap_mard'].count} rows · Updated {importStatus['sap_mard'].updated_at ? formatDateTime(importStatus['sap_mard'].updated_at!) : 'never'}</p>
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
                {importStatus['sap_storage_locations'] && (
                  <p className="text-xs text-gray-500">{importStatus['sap_storage_locations'].count} rows · Updated {importStatus['sap_storage_locations'].updated_at ? formatDateTime(importStatus['sap_storage_locations'].updated_at!) : 'never'}</p>
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
                {importStatus['sap_mseg'] && (
                  <p className="text-xs text-gray-500">{importStatus['sap_mseg'].count} movements · Updated {importStatus['sap_mseg'].updated_at ? formatDateTime(importStatus['sap_mseg'].updated_at!) : 'never'}</p>
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
                {importStatus['sap_lgap'] && (
                  <p className="text-xs text-gray-500">{importStatus['sap_lgap'].count} bins · Updated {importStatus['sap_lgap'].updated_at ? formatDateTime(importStatus['sap_lgap'].updated_at!) : 'never'}</p>
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
              <CardHeader><h3 className="font-semibold text-gray-700 text-sm">WM Bins (Bulk Import)</h3></CardHeader>
              <CardBody className="flex flex-col gap-2">
                {importStatus['wm_bins'] && (
                  <p className="text-xs text-gray-500">{importStatus['wm_bins'].count} bins configured</p>
                )}
                <p className="text-xs text-gray-500">Import bin master data. Can also add manually in WM Bins tab.</p>
                <label className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-dashed border-gray-400 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 ${importing === 'wm_bins' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {importing === 'wm_bins' ? '⟳ Importing…' : '↑ Upload CSV or XLSX'}
                  <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport('wm_bins', '/imports/wm-bins', file);
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

        {/* ─── WM BINS TAB ─── */}
        {tab === 'wmbins' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 flex flex-col gap-3">
              <Card>
                <CardHeader><h3 className="font-semibold text-gray-700 text-sm">Add New Bin</h3></CardHeader>
                <CardBody className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Bin</label>
                      <input value={newBin} onChange={(e) => setNewBin(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && handleAddBin()} placeholder="e.g. A-01-01" className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">SLOC</label>
                      <input value={newBinSloc} onChange={(e) => setNewBinSloc(e.target.value.toUpperCase())} placeholder="e.g. 0001" className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Storage Type</label>
                    <select value={newBinType} onChange={(e) => setNewBinType(e.target.value as '100' | '200')} className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="100">100 — Fixed Bin</option>
                      <option value="200">200 — Secondary Bin</option>
                    </select>
                  </div>
                  <input value={newBinDesc} onChange={(e) => setNewBinDesc(e.target.value)} placeholder="Description (optional)" className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <Button onClick={handleAddBin} loading={addingBin}>Add Bin</Button>
                </CardBody>
              </Card>

              <div className="flex gap-2">
                <input value={wmFilterSloc} onChange={(e) => setWmFilterSloc(e.target.value.toUpperCase())} placeholder="Filter SLOC…" className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={wmFilterType} onChange={(e) => setWmFilterType(e.target.value)} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All types</option>
                  <option value="100">100 – Fixed</option>
                  <option value="200">200 – Secondary</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 480 }}>
                {wmBins.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">No bins configured yet</div>
                ) : wmBins.map((b) => (
                  <div key={b.id} onClick={() => setSelectedBin(b)} className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors flex items-center gap-2 ${selectedBin?.id === b.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-800">{b.bin}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${b.storage_type === '100' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>{b.storage_type === '100' ? 'Fixed' : 'Secondary'}</span>
                      </div>
                      <div className="text-xs text-gray-400">{b.sloc}{b.description ? ` · ${b.description}` : ''} · {b.material_count} material{b.material_count !== 1 ? 's' : ''}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBin(b); }} className="no-min-h p-1 text-red-400 hover:text-red-600 text-sm" title="Delete bin">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3">
              {!selectedBin ? (
                <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-64 text-sm text-gray-400">Select a bin to manage its materials</div>
              ) : (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-gray-800 text-base">{selectedBin.bin}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded font-medium ${selectedBin.storage_type === '100' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                          Type {selectedBin.storage_type} — {selectedBin.storage_type === '100' ? 'Fixed Bin' : 'Secondary Bin'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">SLOC: {selectedBin.sloc}</span>
                    </div>
                    {selectedBin.description && <p className="text-xs text-gray-500 mt-1">{selectedBin.description}</p>}
                  </CardHeader>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <input value={newMatForBin} onChange={(e) => setNewMatForBin(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && handleAddMaterial()} placeholder="Material number to link…" className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      <Button onClick={handleAddMaterial} loading={addingMat} disabled={!newMatForBin.trim()}>Link</Button>
                    </div>
                    <div className="flex flex-col gap-1">
                      {(wmBinMaterials[selectedBin.id] ?? []).length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-xl">No materials linked to this bin yet</div>
                      ) : (wmBinMaterials[selectedBin.id] ?? []).map((m) => (
                        <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                          <span className="font-mono text-sm font-semibold text-gray-800 flex-shrink-0">{m.material_number}</span>
                          <span className="flex-1 text-xs text-gray-500 truncate">{m.material_description ?? '—'}</span>
                          <button onClick={() => handleRemoveMaterial(m.material_number)} className="no-min-h p-1 text-red-400 hover:text-red-600 text-sm flex-shrink-0" title="Unlink material">✕</button>
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

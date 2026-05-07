import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import type { User, Role, InventorySession } from '../types';

const ROLE_OPTIONS = [
  { value: 'counter', label: 'Counter' },
  { value: 'office', label: 'Office' },
  { value: 'admin', label: 'Admin' },
];

export function AdminPage() {
  const { role, username } = useSession();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<Role>('counter');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  const headers = { role: role ?? '', username };

  async function loadUsers() {
    try {
      const data = await api.get<User[]>('/users', { role: role ?? '' });
      setUsers(data);
    } catch { toast('Failed to load users', 'error'); }
  }

  async function loadSessions() {
    try {
      const data = await api.get<InventorySession[]>('/sessions');
      setSessions(data);
    } catch { /**/ }
  }

  useEffect(() => { loadUsers(); loadSessions(); }, []);

  async function handleAddUser() {
    if (!newUsername.trim()) { toast('Username required', 'error'); return; }
    setAdding(true);
    try {
      await api.post('/users', { username: newUsername.trim(), role: newRole }, headers);
      toast(`${newUsername} added as ${newRole}`, 'success');
      setAddOpen(false);
      setNewUsername('');
      setNewRole('counter');
      loadUsers();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to add user', 'error');
    } finally { setAdding(false); }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`, headers);
      toast(`${deleteTarget.username} removed`, 'success');
      setDeleteTarget(null);
      loadUsers();
    } catch { toast('Failed to remove user', 'error'); }
    finally { setDeleting(false); }
  }

  async function handleRoleChange(user: User, newRoleVal: string) {
    try {
      await api.patch(`/users/${user.id}`, { role: newRoleVal }, headers);
      toast(`${user.username} role updated`, 'success');
      loadUsers();
    } catch { toast('Failed to update role', 'error'); }
  }

  async function handleCreateSession() {
    if (!newSessionName.trim()) { toast('Session name required', 'error'); return; }
    setCreatingSession(true);
    try {
      await api.post('/sessions', { name: newSessionName.trim() }, headers);
      toast(`Session "${newSessionName}" created`, 'success');
      setNewSessionName('');
      loadSessions();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally { setCreatingSession(false); }
  }

  async function handleCloseSession(s: InventorySession) {
    try {
      await api.patch(`/sessions/${s.id}/close`, {}, headers);
      toast(`Session "${s.name}" closed`, 'success');
      loadSessions();
    } catch { toast('Failed to close session', 'error'); }
  }

  const roleBadge: Record<string, string> = {
    counter: 'bg-blue-100 text-blue-800',
    office: 'bg-purple-100 text-purple-800',
    admin: 'bg-red-100 text-red-800',
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <h1 className="text-xl font-bold text-gray-900">Admin</h1>

        {/* Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Inventory Sessions</h2>
            </div>
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
            {sessions.map((s) => (
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
            {sessions.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No sessions yet</p>}
          </CardBody>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Users</h2>
              <Button size="sm" onClick={() => setAddOpen(true)}>+ Add User</Button>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <span className="flex-1 text-sm font-medium text-gray-800">{u.username}</span>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u, e.target.value)}
                  className="no-min-h text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge[u.role] ?? 'bg-gray-100'}`}>{u.role}</span>
                <Button variant="ghost" size="sm" className="no-min-h !min-h-0 p-1 text-red-400 hover:text-red-600" onClick={() => setDeleteTarget(u)}>✕</Button>
              </div>
            ))}
            {users.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No users yet</p>}
          </CardBody>
        </Card>
      </div>

      {/* Add user dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add User">
        <div className="flex flex-col gap-4">
          <Input label="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. jsmith" />
          <Select label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} options={ROLE_OPTIONS} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} loading={adding}>Add User</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUser}
        title="Remove User"
        message={`Remove "${deleteTarget?.username}"? They will no longer be able to sign in.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={deleting}
      />
    </AppShell>
  );
}

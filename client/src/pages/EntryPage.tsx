import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import type { InventorySession, SlocConfig, User } from '../types';

export function EntryPage() {
  const { setUser, setSession, setSlocConfigs, username: savedUsername, role } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState(savedUsername);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [selectedSession, setSelectedSession] = useState<InventorySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // If already logged in, redirect
  useEffect(() => {
    if (role) {
      navigate(role === 'counter' ? '/count' : role === 'admin' ? '/admin' : '/office');
    }
  }, [role, navigate]);

  useEffect(() => {
    api.get<InventorySession[]>('/sessions')
      .then((data) => {
        const open = data.filter((s) => s.status === 'open');
        setSessions(open);
        if (open.length === 1) setSelectedSession(open[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  async function handleEnter() {
    if (!username.trim()) { toast('Please enter your username', 'error'); return; }
    if (!selectedSession) { toast('Please select an inventory session', 'error'); return; }

    setLoading(true);
    try {
      const user = await api.get<User>(`/users/lookup?username=${encodeURIComponent(username.trim())}`);
      const configs = await api.get<SlocConfig[]>('/sloc-config');

      setUser(username.trim(), user.role);
      setSession(selectedSession);
      setSlocConfigs(configs);

      navigate(user.role === 'counter' ? '/count' : user.role === 'admin' ? '/admin' : '/office');
    } catch (e) {
      if (e instanceof Error && e.message.includes('not found')) {
        toast('Username not recognized. Contact your supervisor to be added.', 'error');
      } else {
        toast('Failed to sign in. Check server connection.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-blue-600 text-2xl font-bold">PI</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Physical Inventory</h1>
          <p className="text-blue-200 text-sm mt-1">Enter your username to begin</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4">
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
            placeholder="Your username"
            autoFocus
            autoComplete="username"
          />

          {/* Session selector */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Inventory Session</label>
            {loadingSessions ? (
              <div className="text-sm text-gray-400 py-3 text-center">Loading sessions…</div>
            ) : sessions.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                No open sessions. Office must create one first.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSession(s)}
                    className={`no-min-h text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-colors ${
                      selectedSession?.id === s.id
                        ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleEnter} loading={loading} size="lg" className="w-full mt-1">
            Enter
          </Button>
        </div>
      </div>
    </div>
  );
}

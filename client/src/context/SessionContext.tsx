import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Role, InventorySession, SlocConfig } from '../types';

interface SessionContextValue {
  username: string;
  role: Role | null;
  session: InventorySession | null;
  slocConfigs: SlocConfig[];
  setUser: (username: string, role: Role) => void;
  setSession: (session: InventorySession) => void;
  setSlocConfigs: (configs: SlocConfig[]) => void;
  clearUser: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState(() => localStorage.getItem('inv_username') ?? '');
  const [role, setRole] = useState<Role | null>(() => (localStorage.getItem('inv_role') as Role) ?? null);
  const [session, setSession] = useState<InventorySession | null>(() => {
    const s = localStorage.getItem('inv_session');
    return s ? JSON.parse(s) : null;
  });
  const [slocConfigs, setSlocConfigs] = useState<SlocConfig[]>([]);

  function setUser(u: string, r: Role) {
    setUsername(u);
    setRole(r);
    localStorage.setItem('inv_username', u);
    localStorage.setItem('inv_role', r);
  }

  function handleSetSession(s: InventorySession) {
    setSession(s);
    localStorage.setItem('inv_session', JSON.stringify(s));
  }

  function clearUser() {
    setUsername('');
    setRole(null);
    setSession(null);
    localStorage.removeItem('inv_username');
    localStorage.removeItem('inv_role');
    localStorage.removeItem('inv_session');
  }

  // Keep session in sync with any status changes (e.g., closed)
  useEffect(() => {
    if (session) localStorage.setItem('inv_session', JSON.stringify(session));
  }, [session]);

  return (
    <SessionContext.Provider
      value={{ username, role, session, slocConfigs, setUser, setSession: handleSetSession, setSlocConfigs, clearUser }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

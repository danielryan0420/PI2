import React from 'react';
import { useSession } from '../../context/SessionContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

const roleColors: Record<string, string> = {
  counter: 'bg-blue-100 text-blue-800',
  office: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-800',
};

interface NavItem {
  label: string;
  path: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Count', path: '/count', roles: ['counter'] },
  { label: 'Review', path: '/office', roles: ['office', 'admin'] },
  { label: 'Dashboard', path: '/dashboard', roles: ['office', 'admin'] },
  { label: 'Admin', path: '/admin', roles: ['admin'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { username, role, session, clearUser } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top nav bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center h-14 gap-3">
          {/* Logo / title */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">PI</span>
            </div>
            <span className="font-semibold text-gray-800 hidden sm:block">Physical Inventory</span>
          </div>

          {/* Nav links */}
          <nav className="flex gap-1 flex-1 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'no-min-h px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  location.pathname.startsWith(item.path)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Session + user info */}
          <div className="flex items-center gap-2 shrink-0">
            {session && (
              <span className="hidden sm:block text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {session.name}
              </span>
            )}
            {role && (
              <span className={cn('text-xs font-medium px-2 py-1 rounded-full', roleColors[role])}>
                {role}
              </span>
            )}
            <span className="text-sm font-medium text-gray-700 hidden sm:block">{username}</span>
            <button
              onClick={() => { clearUser(); navigate('/'); }}
              className="no-min-h text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

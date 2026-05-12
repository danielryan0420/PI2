import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';
import { EntryPage } from './pages/EntryPage';
import { CounterPage } from './pages/CounterPage';
import { OfficePage } from './pages/OfficePage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { role } = useSession();
  if (!role) return <Navigate to="/" replace />;
  if (!allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { role } = useSession();
  return (
    <Routes>
      <Route path="/" element={
        role ? <Navigate to={role === 'counter' ? '/count' : '/admin'} replace /> : <EntryPage />
      } />
      <Route path="/count" element={
        <ProtectedRoute allowedRoles={['counter', 'admin']}>
          <CounterPage />
        </ProtectedRoute>
      } />
      <Route path="/review" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <OfficePage />
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['admin', 'counter']}>
          <DashboardPage />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminPage />
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}

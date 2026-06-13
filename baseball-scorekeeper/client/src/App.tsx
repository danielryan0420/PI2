import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { TeamsPage } from './pages/TeamsPage';
import { RosterPage } from './pages/RosterPage';
import { GameLogPage } from './pages/GameLogPage';
import { GameSetupPage } from './pages/GameSetupPage';
import { ScorekeeperPage } from './pages/ScorekeeperPage';
import { ScoreboardPage } from './pages/ScoreboardPage';
import { BoxScorePage } from './pages/BoxScorePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function NavBar() {
  const { user, logout } = useAuth();
  return (
    <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link to="/games" className="font-bold text-lg">Baseball Scorekeeper</Link>
        <Link to="/games" className="hover:underline">Games</Link>
        <Link to="/teams" className="hover:underline">Teams</Link>
      </div>
      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <span>{user.username}</span>
          <button onClick={logout} className="hover:underline min-h-0">Log out</button>
        </div>
      ) : (
        <Link to="/login" className="hover:underline text-sm">Log in</Link>
      )}
    </header>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public, no-auth routes (must work in OBS browser sources) */}
      <Route path="/scoreboard/:gameId" element={<ScoreboardPage />} />
      <Route path="/games/:gameId/box" element={<><NavBar /><BoxScorePage /></>} />

      {/* App routes */}
      <Route path="/login" element={<><NavBar /><LoginPage /></>} />
      <Route path="/games" element={<><NavBar /><GameLogPage /></>} />
      <Route path="/games/new" element={<RequireAuth><NavBar /><GameSetupPage /></RequireAuth>} />
      <Route path="/games/:gameId/setup" element={<RequireAuth><NavBar /><GameSetupPage /></RequireAuth>} />
      <Route path="/score/:gameId" element={<RequireAuth><ScorekeeperPage /></RequireAuth>} />
      <Route path="/teams" element={<RequireAuth><NavBar /><TeamsPage /></RequireAuth>} />
      <Route path="/teams/:teamId/roster" element={<RequireAuth><NavBar /><RosterPage /></RequireAuth>} />

      <Route path="/" element={<Navigate to="/games" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, Input } from '../components/ui/Card';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('scorekeeper');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      const from = (location.state as { from?: Location })?.from?.pathname || '/games';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-bold mb-4">Scorekeeper Login</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>Log in</Button>
          <p className="text-xs text-gray-400">
            Default account: scorekeeper / baseball
          </p>
        </form>
      </Card>
    </div>
  );
}

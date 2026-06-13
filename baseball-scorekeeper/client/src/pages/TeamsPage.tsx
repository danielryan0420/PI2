import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, Input } from '../components/ui/Card';
import type { Team } from '../types';

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1d4ed8');
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<Team[]>('/teams').then(setTeams);

  useEffect(() => { load(); }, []);

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await api.post('/teams', { name, short_name: shortName || null, primary_color: primaryColor });
      setName('');
      setShortName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Teams</h1>

      <Card>
        <h2 className="font-semibold mb-2">Add a team</h2>
        <form onSubmit={createTeam} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-gray-500 block mb-1">Team name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. River City Rockets" />
          </div>
          <div className="w-28">
            <label className="text-xs text-gray-500 block mb-1">Short name</label>
            <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="RCR" maxLength={4} />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-500 block mb-1">Color</label>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-full h-10 rounded border border-gray-300"
            />
          </div>
          <Button type="submit">Add team</Button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </Card>

      <div className="space-y-2">
        {teams.map((team) => (
          <Card key={team.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: team.primary_color || '#999' }} />
              <span className="font-semibold">{team.name}</span>
              {team.short_name && <span className="text-gray-400 text-sm">({team.short_name})</span>}
            </div>
            <Link to={`/teams/${team.id}/roster`} className="text-blue-600 hover:underline text-sm min-h-0">
              Manage roster
            </Link>
          </Card>
        ))}
        {teams.length === 0 && <p className="text-gray-400 text-sm">No teams yet.</p>}
      </div>
    </div>
  );
}

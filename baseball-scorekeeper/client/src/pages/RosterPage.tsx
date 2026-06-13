import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, Input, Select } from '../components/ui/Card';
import type { Player, Team } from '../types';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

export function RosterPage() {
  const { teamId } = useParams();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<Team>(`/teams/${teamId}`).then(setTeam);
    api.get<Player[]>(`/teams/${teamId}/players`).then(setPlayers);
  };

  useEffect(() => { load(); }, [teamId]);

  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return;
    try {
      await api.post(`/teams/${teamId}/players`, {
        first_name: firstName,
        last_name: lastName,
        jersey_number: jersey || null,
        primary_position: position || null,
      });
      setFirstName('');
      setLastName('');
      setJersey('');
      setPosition('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player');
    }
  };

  const removePlayer = async (id: number) => {
    await api.delete(`/players/${id}`);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Link to="/teams" className="text-blue-600 text-sm hover:underline">&larr; Teams</Link>
      <h1 className="text-xl font-bold">{team?.name || 'Roster'}</h1>

      <Card>
        <h2 className="font-semibold mb-2">Add player</h2>
        <form onSubmit={addPlayer} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-gray-500 block mb-1">First name</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-gray-500 block mb-1">Last name</label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-500 block mb-1">Number</label>
            <Input value={jersey} onChange={(e) => setJersey(e.target.value)} />
          </div>
          <div className="w-24">
            <label className="text-xs text-gray-500 block mb-1">Position</label>
            <Select value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">-</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <Button type="submit">Add</Button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </Card>

      <div className="space-y-2">
        {players.map((p) => (
          <Card key={p.id} className="flex items-center justify-between py-2">
            <div className="text-sm">
              <span className="font-mono text-gray-500 mr-2">#{p.jersey_number ?? '-'}</span>
              <span className="font-semibold">{p.first_name} {p.last_name}</span>
              {p.primary_position && <span className="text-gray-400 ml-2">{p.primary_position}</span>}
            </div>
            <Button variant="ghost" onClick={() => removePlayer(p.id)} className="text-red-600 text-xs px-2 py-1">
              Remove
            </Button>
          </Card>
        ))}
        {players.length === 0 && <p className="text-gray-400 text-sm">No players yet.</p>}
      </div>
    </div>
  );
}

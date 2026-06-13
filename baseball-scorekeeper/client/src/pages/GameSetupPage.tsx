import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, Input, Select } from '../components/ui/Card';
import { LineupEditor, type LineupEntry } from '../components/scorekeeper/LineupEditor';
import type { Game, Team, Player, Lineup } from '../types';

const EMPTY_LINEUP: LineupEntry[] = Array.from({ length: 9 }, () => ({ player_id: '', position: '' }));

export function GameSetupPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  if (!gameId) return <NewGameForm />;
  return <LineupSetup gameId={Number(gameId)} />;
}

function NewGameForm() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [venue, setVenue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [innings, setInnings] = useState(9);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.get<Team[]>('/teams').then(setTeams); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!homeTeamId || !awayTeamId) {
      setError('Select both teams');
      return;
    }
    try {
      const game = await api.post<Game>('/games', {
        home_team_id: Number(homeTeamId),
        away_team_id: Number(awayTeamId),
        venue: venue || null,
        scheduled_at: scheduledAt || null,
        innings_scheduled: innings,
      });
      navigate(`/games/${game.id}/setup`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">New game</h1>
      {teams.length < 2 && (
        <p className="text-sm text-amber-600">
          You need at least two teams. <Link to="/teams" className="underline">Create teams</Link> first.
        </p>
      )}
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Away team</label>
            <Select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
              <option value="">-- select --</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Home team</label>
            <Select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
              <option value="">-- select --</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Venue</label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date / time</label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Innings</label>
            <Input type="number" min={1} max={15} value={innings} onChange={(e) => setInnings(Number(e.target.value))} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">Create game</Button>
        </form>
      </Card>
    </div>
  );
}

function LineupSetup({ gameId }: { gameId: number }) {
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);
  const [homeEntries, setHomeEntries] = useState<LineupEntry[]>(EMPTY_LINEUP);
  const [awayEntries, setAwayEntries] = useState<LineupEntry[]>(EMPTY_LINEUP);
  const [savedHome, setSavedHome] = useState(false);
  const [savedAway, setSavedAway] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Game>(`/games/${gameId}`).then((g) => {
      setGame(g);
      api.get<Player[]>(`/teams/${g.home_team_id}/players`).then(setHomeRoster);
      api.get<Player[]>(`/teams/${g.away_team_id}/players`).then(setAwayRoster);
      api.get<Lineup[]>(`/games/${gameId}/lineups`).then((lineups) => {
        const home = lineups.filter((l) => l.team_id === g.home_team_id);
        const away = lineups.filter((l) => l.team_id === g.away_team_id);
        if (home.length) {
          setHomeEntries(toEntries(home));
          setSavedHome(true);
        }
        if (away.length) {
          setAwayEntries(toEntries(away));
          setSavedAway(true);
        }
      });
    });
  }, [gameId]);

  const toEntries = (lineups: Lineup[]): LineupEntry[] => {
    const sorted = [...lineups].sort((a, b) => a.batting_order - b.batting_order);
    const entries = [...EMPTY_LINEUP];
    sorted.forEach((l, i) => {
      if (i < entries.length) entries[i] = { player_id: l.player_id, position: l.position };
    });
    return entries;
  };

  const saveLineup = async (teamId: number, entries: LineupEntry[], setSaved: (v: boolean) => void) => {
    setError(null);
    const filled = entries.filter((e) => e.player_id !== '' && e.position);
    if (filled.length < 9) {
      setError('Lineup must have 9 players with positions assigned.');
      return;
    }
    const playerIds = filled.map((e) => e.player_id);
    if (new Set(playerIds).size !== playerIds.length) {
      setError('Each player can only appear once in the lineup.');
      return;
    }
    try {
      await api.post(`/games/${gameId}/lineups`, {
        team_id: teamId,
        entries: filled.map((e, i) => ({ player_id: e.player_id, batting_order: i + 1, position: e.position })),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lineup');
    }
  };

  const startGame = async () => {
    setError(null);
    try {
      await api.post(`/games/${gameId}/start`);
      navigate(`/score/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game');
    }
  };

  if (!game) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">
        {game.away_team_name} @ {game.home_team_name}
      </h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold mb-2">{game.away_team_name} (Away) lineup</h2>
          <LineupEditor roster={awayRoster} entries={awayEntries} onChange={setAwayEntries} />
          <Button className="mt-3 w-full" onClick={() => saveLineup(game.away_team_id, awayEntries, setSavedAway)}>
            {savedAway ? 'Update lineup' : 'Save lineup'}
          </Button>
        </Card>
        <Card>
          <h2 className="font-semibold mb-2">{game.home_team_name} (Home) lineup</h2>
          <LineupEditor roster={homeRoster} entries={homeEntries} onChange={setHomeEntries} />
          <Button className="mt-3 w-full" onClick={() => saveLineup(game.home_team_id, homeEntries, setSavedHome)}>
            {savedHome ? 'Update lineup' : 'Save lineup'}
          </Button>
        </Card>
      </div>

      {game.status === 'scheduled' && (
        <Button
          className="w-full"
          disabled={!savedHome || !savedAway}
          onClick={startGame}
        >
          Start game
        </Button>
      )}
      {game.status === 'in_progress' && (
        <Link to={`/score/${gameId}`}><Button className="w-full">Go to scorekeeper</Button></Link>
      )}
    </div>
  );
}

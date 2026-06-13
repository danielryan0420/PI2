import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { Game } from '../types';

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'Live',
  completed: 'Final',
};

export function GameLogPage() {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    api.get<Game[]>('/games').then(setGames);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Games</h1>
        {user && <Link to="/games/new"><Button>New game</Button></Link>}
      </div>

      <div className="space-y-2">
        {games.map((g) => (
          <Card key={g.id} className="flex items-center justify-between">
            <div>
              <div className="font-semibold">
                {g.away_team_short || g.away_team_name} @ {g.home_team_short || g.home_team_name}
              </div>
              <div className="text-xs text-gray-400">
                {STATUS_LABELS[g.status]}{g.venue ? ` · ${g.venue}` : ''}
              </div>
            </div>
            <div className="flex gap-3 text-sm">
              {g.status === 'scheduled' && user && (
                <Link to={`/games/${g.id}/setup`} className="text-blue-600 hover:underline min-h-0">Setup</Link>
              )}
              {g.status !== 'scheduled' && (
                <>
                  <Link to={`/scoreboard/${g.id}`} className="text-blue-600 hover:underline min-h-0">Scoreboard</Link>
                  <Link to={`/games/${g.id}/box`} className="text-blue-600 hover:underline min-h-0">Box score</Link>
                </>
              )}
              {g.status === 'in_progress' && user && (
                <Link to={`/score/${g.id}`} className="text-blue-600 hover:underline min-h-0">Score</Link>
              )}
            </div>
          </Card>
        ))}
        {games.length === 0 && <p className="text-gray-400 text-sm">No games yet.</p>}
      </div>
    </div>
  );
}

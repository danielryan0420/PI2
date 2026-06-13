import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import { formatAvg } from '../lib/stats';
import type { BoxScore, BoxScorePlayer, Game } from '../types';

function BattingTable({ title, players }: { title: string; players: BoxScorePlayer[] }) {
  return (
    <Card>
      <h2 className="font-semibold mb-2">{title}</h2>
      <table className="w-full text-sm text-center">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="text-left py-1">Player</th>
            <th className="py-1">Pos</th>
            <th className="py-1">AB</th>
            <th className="py-1">R</th>
            <th className="py-1">H</th>
            <th className="py-1">RBI</th>
            <th className="py-1">BB</th>
            <th className="py-1">K</th>
            <th className="py-1">AVG</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.player_id} className="border-b border-gray-100">
              <td className="text-left py-1">#{p.jersey_number ?? '-'} {p.first_name} {p.last_name}</td>
              <td className="py-1">{p.position}</td>
              <td className="py-1">{p.ab}</td>
              <td className="py-1">{p.r}</td>
              <td className="py-1">{p.h}</td>
              <td className="py-1">{p.rbi}</td>
              <td className="py-1">{p.bb}</td>
              <td className="py-1">{p.k}</td>
              <td className="py-1">{formatAvg(p.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function BoxScorePage() {
  const { gameId } = useParams();
  const [box, setBox] = useState<BoxScore | null>(null);
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    api.get<Game>(`/games/${gameId}`).then(setGame);
    api.get<BoxScore>(`/games/${gameId}/box-score`).then(setBox);
  }, [gameId]);

  if (!box || !game) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link to="/games" className="text-blue-600 text-sm hover:underline">&larr; Games</Link>
      <h1 className="text-xl font-bold">{game.away_team_name} @ {game.home_team_name} - Box Score</h1>
      <BattingTable title={game.away_team_name} players={box.away} />
      <BattingTable title={game.home_team_name} players={box.home} />
      <Link to={`/scoreboard/${gameId}`} className="text-blue-600 text-sm hover:underline">View live scoreboard &rarr;</Link>
    </div>
  );
}

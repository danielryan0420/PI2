import type { Game, GameStateRow } from '../../types';

interface LineScoreProps {
  game: Game;
  gameState: GameStateRow;
  lineScore: Record<string, Record<string, number>>;
}

export function LineScore({ game, gameState, lineScore }: LineScoreProps) {
  const innings = Array.from({ length: Math.max(game.innings_scheduled, gameState.inning) }, (_, i) => i + 1);

  const totalFor = (teamId: number) => {
    const row = lineScore[String(teamId)] || {};
    return Object.values(row).reduce((sum, r) => sum + (r || 0), 0);
  };

  const cell = (teamId: number, inning: number, isCurrentHalf: boolean) => {
    if (inning > gameState.inning || (inning === gameState.inning && isCurrentHalf)) {
      return inning === gameState.inning && isCurrentHalf ? '-' : '';
    }
    const row = lineScore[String(teamId)] || {};
    return row[String(inning)] ?? 0;
  };

  return (
    <table className="w-full text-center text-sm border-collapse">
      <thead>
        <tr className="border-b border-gray-300">
          <th className="text-left px-2 py-1 w-24">Team</th>
          {innings.map((i) => (
            <th key={i} className="px-2 py-1">{i}</th>
          ))}
          <th className="px-2 py-1 font-bold">R</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-gray-100">
          <td className="text-left px-2 py-1 font-semibold">{game.away_team_short || game.away_team_name}</td>
          {innings.map((i) => (
            <td key={i} className="px-2 py-1">{cell(game.away_team_id, i, gameState.half === 'top')}</td>
          ))}
          <td className="px-2 py-1 font-bold">{totalFor(game.away_team_id)}</td>
        </tr>
        <tr>
          <td className="text-left px-2 py-1 font-semibold">{game.home_team_short || game.home_team_name}</td>
          {innings.map((i) => (
            <td key={i} className="px-2 py-1">{cell(game.home_team_id, i, gameState.half === 'bottom')}</td>
          ))}
          <td className="px-2 py-1 font-bold">{totalFor(game.home_team_id)}</td>
        </tr>
      </tbody>
    </table>
  );
}

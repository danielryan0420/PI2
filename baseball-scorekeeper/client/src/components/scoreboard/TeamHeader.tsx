import type { GameStateSnapshot } from '../../types';

export function TeamHeader({ state }: { state: GameStateSnapshot }) {
  const { game, game_state } = state;
  if (!game_state) {
    return <div className="text-lg font-semibold">{game.away_team_name} @ {game.home_team_name}</div>;
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-lg font-bold">
        {game.away_team_short || game.away_team_name} <span className="text-2xl mx-1">{game_state.away_score}</span>
      </div>
      <div className="text-center text-sm">
        <div className="font-semibold">
          {game_state.half === 'top' ? 'Top' : 'Bot'} {game_state.inning}
        </div>
      </div>
      <div className="text-lg font-bold">
        <span className="text-2xl mx-1">{game_state.home_score}</span> {game.home_team_short || game.home_team_name}
      </div>
    </div>
  );
}

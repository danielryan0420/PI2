import { CountIndicator } from '../scoreboard/CountIndicator';
import type { GameStateRow } from '../../types';

export function CountDisplay({ gameState }: { gameState: GameStateRow }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="text-sm">
        <div className="font-semibold">{gameState.half === 'top' ? 'Top' : 'Bottom'} {gameState.inning}</div>
      </div>
      <CountIndicator balls={gameState.balls} strikes={gameState.strikes} outs={gameState.outs} />
      <div className="text-lg font-bold tabular-nums">
        {gameState.away_score} - {gameState.home_score}
      </div>
    </div>
  );
}

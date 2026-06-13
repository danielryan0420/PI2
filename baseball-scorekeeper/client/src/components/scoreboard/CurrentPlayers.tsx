import type { GameStateSnapshot } from '../../types';

export function CurrentPlayers({ state }: { state: GameStateSnapshot }) {
  const batter = state.current_batter;
  const pitcher = state.current_pitcher;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div>
        <span className="text-gray-500">At bat:</span>{' '}
        {batter ? (
          <span className="font-semibold">
            #{batter.jersey_number ?? '-'} {batter.first_name} {batter.last_name}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </div>
      <div>
        <span className="text-gray-500">Pitching:</span>{' '}
        {pitcher ? (
          <span className="font-semibold">
            #{pitcher.jersey_number ?? '-'} {pitcher.first_name} {pitcher.last_name}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </div>
    </div>
  );
}

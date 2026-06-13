import { Diamond } from '../Diamond';
import { RUNNER_ACTION_LABELS } from '../../lib/baseballRules';
import type { GameStateSnapshot, RunnerActions } from '../../types';

interface BaserunnerDiamondProps {
  state: GameStateSnapshot;
  runnerActions: RunnerActions;
  onCycle: (base: '1b' | '2b' | '3b') => void;
}

/**
 * Interactive diamond for the scorekeeper. Each occupied base shows the
 * pending action (defaulted per outcome); tapping cycles through the
 * possible actions for that runner so the scorekeeper can override.
 */
export function BaserunnerDiamond({ state, runnerActions, onCycle }: BaserunnerDiamondProps) {
  const occupied = state.bases_occupied || { '1b': false, '2b': false, '3b': false };
  const runners = state.runners;

  const labelFor = (base: '1b' | '2b' | '3b') => {
    if (!occupied[base]) return undefined;
    const runner = runners?.[base];
    const name = runner ? `#${runner.jersey_number ?? ''} ${runner.last_name}` : '';
    return `${name} - ${RUNNER_ACTION_LABELS[runnerActions[base]]}`;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Diamond
        occupied={occupied}
        labels={{ '1b': labelFor('1b'), '2b': labelFor('2b'), '3b': labelFor('3b') }}
        onBaseClick={(base) => occupied[base] && onCycle(base)}
        size={140}
      />
      <div className="grid grid-cols-3 gap-2 text-xs text-center w-full max-w-xs">
        {(['3b', '2b', '1b'] as const).map((base) => (
          <div key={base} className="flex flex-col items-center">
            <span className="font-semibold">{base.toUpperCase()}</span>
            {occupied[base] ? (
              <button
                type="button"
                onClick={() => onCycle(base)}
                className="min-h-0 px-2 py-1 mt-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
              >
                {runners?.[base] ? `${runners[base]!.last_name}: ` : ''}{RUNNER_ACTION_LABELS[runnerActions[base]]}
              </button>
            ) : (
              <span className="text-gray-400 mt-1">empty</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

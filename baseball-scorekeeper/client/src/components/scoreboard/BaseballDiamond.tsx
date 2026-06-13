import { Diamond } from '../Diamond';
import type { GameStateSnapshot } from '../../types';

export function BaseballDiamond({ state, size = 110 }: { state: GameStateSnapshot; size?: number }) {
  const occupied = state.bases_occupied || { '1b': false, '2b': false, '3b': false };
  const runners = state.runners;

  const labels = runners
    ? {
        '1b': runners['1b'] ? `#${runners['1b'].jersey_number ?? ''} ${runners['1b'].last_name}` : undefined,
        '2b': runners['2b'] ? `#${runners['2b'].jersey_number ?? ''} ${runners['2b'].last_name}` : undefined,
        '3b': runners['3b'] ? `#${runners['3b'].jersey_number ?? ''} ${runners['3b'].last_name}` : undefined,
      }
    : undefined;

  return <Diamond occupied={occupied} labels={labels} size={size} />;
}

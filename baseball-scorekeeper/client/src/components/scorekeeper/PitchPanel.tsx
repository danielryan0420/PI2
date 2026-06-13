import { Button } from '../ui/Button';
import type { GameStateRow } from '../../types';

interface PitchPanelProps {
  gameState: GameStateRow;
  onPitch: (type: 'ball' | 'strike' | 'foul') => void;
  onUndoPitch: () => void;
  busy: boolean;
}

/**
 * Pitch-by-pitch entry: tap a result for each pitch. The server auto-completes
 * the at-bat as a walk on ball 4 or a strikeout on strike 3 (a foul with two
 * strikes doesn't add a third strike). Use the at-bat outcome picker below for
 * the result once the ball is put in play.
 */
export function PitchPanel({ gameState, onPitch, onUndoPitch, busy }: PitchPanelProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase">Pitch</span>
        <button
          onClick={onUndoPitch}
          disabled={busy || !gameState.last_pitch}
          className="text-xs text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline min-h-0"
        >
          Undo pitch
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => onPitch('ball')} className="w-full">
          Ball
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onPitch('strike')} className="w-full">
          Strike
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onPitch('foul')} className="w-full">
          Foul
        </Button>
      </div>
      <p className="text-xs text-gray-400">
        4th ball &rarr; automatic walk. 3rd strike &rarr; automatic strikeout. If the
        ball is put in play, skip the pitch buttons and pick the result below.
      </p>
    </div>
  );
}

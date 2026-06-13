import { clsx } from 'clsx';
import { OUTCOME_GROUPS, OUTCOME_LABELS } from '../../lib/baseballRules';
import type { AtBatOutcome } from '../../types';

interface AtBatOutcomePickerProps {
  selected: AtBatOutcome | null;
  onSelect: (outcome: AtBatOutcome) => void;
}

export function AtBatOutcomePicker({ selected, onSelect }: AtBatOutcomePickerProps) {
  return (
    <div className="space-y-3">
      {OUTCOME_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-gray-500 mb-1">{group.label}</div>
          <div className="grid grid-cols-4 gap-2">
            {group.outcomes.map((outcome) => (
              <button
                key={outcome}
                type="button"
                onClick={() => onSelect(outcome)}
                className={clsx(
                  'py-3 rounded-lg border text-sm font-semibold transition-colors',
                  selected === outcome
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-gray-300 hover:border-blue-400'
                )}
              >
                {OUTCOME_LABELS[outcome]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

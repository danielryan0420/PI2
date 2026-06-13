import { Select } from '../ui/Card';
import type { Player } from '../../types';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

export interface LineupEntry {
  player_id: number | '';
  position: string;
}

interface LineupEditorProps {
  roster: Player[];
  entries: LineupEntry[];
  onChange: (entries: LineupEntry[]) => void;
}

export function LineupEditor({ roster, entries, onChange }: LineupEditorProps) {
  const update = (index: number, field: keyof LineupEntry, value: string) => {
    const next = entries.map((e, i) =>
      i === index ? { ...e, [field]: field === 'player_id' ? (value ? Number(value) : '') : value } : e
    );
    onChange(next);
  };

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="py-1 w-10">#</th>
          <th className="py-1">Player</th>
          <th className="py-1 w-24">Position</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => (
          <tr key={i} className="border-t border-gray-100">
            <td className="py-1 font-semibold">{i + 1}</td>
            <td className="py-1 pr-2">
              <Select value={entry.player_id} onChange={(e) => update(i, 'player_id', e.target.value)}>
                <option value="">-- select player --</option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.jersey_number ?? '-'} {p.first_name} {p.last_name}
                  </option>
                ))}
              </Select>
            </td>
            <td className="py-1">
              <Select value={entry.position} onChange={(e) => update(i, 'position', e.target.value)}>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </Select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

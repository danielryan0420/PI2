import { clsx } from 'clsx';

interface DiamondProps {
  occupied: { '1b': boolean; '2b': boolean; '3b': boolean };
  labels?: { '1b'?: string; '2b'?: string; '3b'?: string };
  onBaseClick?: (base: '1b' | '2b' | '3b') => void;
  size?: number;
}

/** Renders a baseball diamond with three bases. Home plate is at the bottom. */
export function Diamond({ occupied, labels, onBaseClick, size = 120 }: DiamondProps) {
  const baseSize = size * 0.22;

  const positions: Record<'1b' | '2b' | '3b', { left: number; top: number }> = {
    '2b': { left: size / 2 - baseSize / 2, top: 0 },
    '1b': { left: size - baseSize, top: size / 2 - baseSize },
    '3b': { left: 0, top: size / 2 - baseSize },
  };

  return (
    <div className="relative" style={{ width: size, height: size * 0.75 }}>
      {/* base paths */}
      <svg className="absolute inset-0" width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.75}`}>
        <polygon
          points={`${size / 2},2 ${size - 2},${size / 2} ${size / 2},${size * 0.75 - 2} 2,${size / 2}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
        />
      </svg>

      {(['1b', '2b', '3b'] as const).map((base) => (
        <button
          key={base}
          type="button"
          disabled={!onBaseClick}
          onClick={() => onBaseClick?.(base)}
          className={clsx(
            'absolute rounded-sm border-2 transform rotate-45 flex items-center justify-center min-h-0',
            occupied[base] ? 'bg-yellow-400 border-yellow-600' : 'bg-white border-gray-400',
            onBaseClick && 'cursor-pointer hover:border-blue-500'
          )}
          style={{ left: positions[base].left, top: positions[base].top, width: baseSize, height: baseSize }}
          title={labels?.[base]}
        />
      ))}

      {/* home plate */}
      <div
        className="absolute bg-gray-300 border-2 border-gray-500"
        style={{
          left: size / 2 - baseSize / 2,
          top: size * 0.75 - baseSize,
          width: baseSize,
          height: baseSize,
        }}
      />
    </div>
  );
}

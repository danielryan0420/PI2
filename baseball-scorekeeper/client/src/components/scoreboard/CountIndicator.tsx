import { clsx } from 'clsx';

interface CountIndicatorProps {
  balls: number;
  strikes: number;
  outs: number;
}

function Dots({ count, max, color }: { count: number; max: number; color: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={clsx('w-3 h-3 rounded-full border', i < count ? color : 'bg-transparent border-gray-400')}
        />
      ))}
    </div>
  );
}

export function CountIndicator({ balls, strikes, outs }: CountIndicatorProps) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-600">B</span>
        <Dots count={balls} max={3} color="bg-green-500 border-green-600" />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-600">S</span>
        <Dots count={strikes} max={2} color="bg-yellow-500 border-yellow-600" />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-600">O</span>
        <Dots count={outs} max={2} color="bg-red-500 border-red-600" />
      </div>
    </div>
  );
}

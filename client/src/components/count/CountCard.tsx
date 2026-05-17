import React from 'react';
import { StatusBadge } from '../ui/Badge';
import { Card, CardBody } from '../ui/Card';
import { formatDateTime, formatNumber } from '../../lib/utils';
import type { Count } from '../../types';

interface CountCardProps {
  count: Count;
  onRecount?: (count: Count) => void;
}

export function CountCard({ count, onRecount }: CountCardProps) {
  const statusColor = count.status === 'verified' ? 'border-l-green-500' : count.status === 'flagged' ? 'border-l-red-500' : 'border-l-blue-400';

  return (
    <Card className={`border-l-4 ${statusColor}`}>
      <CardBody className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-800">{count.material_number}</span>
              <StatusBadge status={count.status} />
              <span className="text-xs text-gray-400">#{count.id}</span>
            </div>
            {count.material_description && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{count.material_description}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className="text-lg font-bold text-gray-800">{formatNumber(count.quantity)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span>{count.sloc}</span>
          {count.wm_bin && <span>WM: {count.wm_bin}</span>}
          {count.zbin && <span>ZBIN: {count.zbin}</span>}
          <span className="ml-auto">{formatDateTime(count.created_at)}</span>
        </div>

        {count.status === 'flagged' && (
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
            <span>⚠ Flagged for recount — use Messages tab to ask the office a question</span>
            {onRecount && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRecount(count); }}
                className="no-min-h shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1 rounded-lg transition-colors"
              >
                Recount
              </button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

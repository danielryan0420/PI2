import { useState } from 'react';
import { Button } from '../ui/Button';

export function UndoBar({ onUndo, disabled }: { onUndo: () => Promise<void>; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2">
        <span className="text-sm text-red-700 flex-1">Undo the last play?</span>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onUndo();
            } finally {
              setBusy(false);
              setConfirming(false);
            }
          }}
        >
          Yes, undo
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" className="w-full" disabled={disabled} onClick={() => setConfirming(true)}>
      Undo last play
    </Button>
  );
}

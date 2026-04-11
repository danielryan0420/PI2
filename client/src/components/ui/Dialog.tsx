import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div className={cn(
        'relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg mx-0 sm:mx-4',
        'max-h-[90vh] flex flex-col',
        className
      )}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <Button variant="ghost" size="sm" className="no-min-h !min-h-0 p-1" onClick={onClose}>✕</Button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmVariant = 'primary', loading }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

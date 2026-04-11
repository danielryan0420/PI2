import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  label?: string;
}

export function BarcodeScanner({ open, onClose, onScan, label = 'Scan' }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setError(null);
    setScanning(true);

    const start = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        // Prefer rear camera on mobile
        const preferred = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        const deviceId = preferred?.deviceId ?? undefined;

        await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result, err) => {
          if (result) {
            const text = result.getText();
            onScan(text);
            onClose();
          }
          if (err && err.name !== 'NotFoundException') {
            // NotFoundException is expected during scanning between frames
            console.debug('[scanner] decode error:', err.name);
          }
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access.');
        } else if (e instanceof Error) {
          setError(`Camera unavailable: ${e.message}`);
        } else {
          setError('Could not start camera.');
        }
      } finally {
        setScanning(false);
      }
    };

    start();

    return () => {
      reader.reset();
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={`Scan — ${label}`}>
      <div className="flex flex-col gap-3">
        {error ? (
          <div className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</div>
        ) : (
          <>
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} className="w-full h-full object-cover" />
              {/* Viewfinder overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-32 border-2 border-white rounded-lg opacity-70" />
              </div>
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="text-white text-sm">Starting camera…</div>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 text-center">
              Point camera at barcode or QR code. Will auto-detect.
            </p>
          </>
        )}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}

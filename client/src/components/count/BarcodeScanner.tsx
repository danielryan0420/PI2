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

// Camera API requires HTTPS (or localhost). On HTTP/iOS without certs,
// mediaDevices is undefined — fall back to photo capture via file input.
const LIVE_CAMERA_AVAILABLE = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function BarcodeScanner({ open, onClose, onScan, label = 'Scan' }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [decoding, setDecoding] = useState(false);

  // ── Live video mode (HTTPS / desktop) ──────────────────────────────────
  useEffect(() => {
    if (!open || !LIVE_CAMERA_AVAILABLE) return;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setError(null);
    setScanning(true);

    const start = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const preferred = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        await reader.decodeFromVideoDevice(preferred?.deviceId, videoRef.current!, (result, err) => {
          if (result) { onScan(result.getText()); onClose(); }
          if (err && err.name !== 'NotFoundException') console.debug('[scanner]', err.name);
        });
      } catch (e) {
        setError(e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access.'
          : `Camera unavailable: ${e instanceof Error ? e.message : 'unknown error'}`);
      } finally { setScanning(false); }
    };

    start();
    return () => { try { (reader as unknown as { reset?: () => void }).reset?.(); } catch { /**/ } };
  }, [open]);

  // ── Photo capture mode (HTTP / iOS without cert) ────────────────────────
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDecoding(true);
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      onScan(result.getText());
      onClose();
    } catch {
      setError('No barcode found in that photo. Try again with better lighting or hold the camera closer.');
    } finally {
      URL.revokeObjectURL(url);
      setDecoding(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Scan — ${label}`}>
      <div className="flex flex-col gap-3">
        {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</div>}

        {LIVE_CAMERA_AVAILABLE ? (
          /* ── Live viewfinder ── */
          !error && (
            <>
              <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-32 border-2 border-white rounded-lg opacity-70" />
                </div>
                {scanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="text-white text-sm">Starting camera…</div>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">Point camera at barcode or QR code.</p>
            </>
          )
        ) : (
          /* ── Photo capture fallback (iOS over HTTP) ── */
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600 text-center">
              Tap the button below to open your camera, take a photo of the barcode, and it will be decoded automatically.
            </p>
            <label className={`flex items-center justify-center gap-2 min-h-[56px] rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 font-medium text-sm cursor-pointer hover:bg-blue-100 transition-colors ${decoding ? 'opacity-50 pointer-events-none' : ''}`}>
              {decoding ? '⟳ Decoding…' : '📷 Open Camera'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </label>
            <p className="text-xs text-gray-400 text-center">Hold the barcode steady and well-lit for best results.</p>
          </div>
        )}

        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}

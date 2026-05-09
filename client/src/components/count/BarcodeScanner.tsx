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

// Camera stream requires HTTPS (or localhost). On plain HTTP (e.g. iPhone on LAN),
// mediaDevices is undefined — fall back to photo capture via file input instead.
const LIVE_CAMERA_AVAILABLE =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

async function decodeBarcode(file: File): Promise<string> {
  const reader = new BrowserMultiFormatReader();
  const url = URL.createObjectURL(file);

  // First attempt: decode directly from the blob URL
  try {
    const result = await reader.decodeFromImageUrl(url);
    URL.revokeObjectURL(url);
    return result.getText();
  } catch { /* try resized */ }

  // Second attempt: scale the image down — iOS photos can be 12+ MP which
  // confuses ZXing. Resize to a width ZXing handles well.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const MAX = 1280;
        const ratio = Math.min(1, MAX / img.width, MAX / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resized = canvas.toDataURL('image/jpeg', 0.9);
        const result = await new BrowserMultiFormatReader().decodeFromImageUrl(resized);
        resolve(result.getText());
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

export function BarcodeScanner({ open, onClose, onScan, label = 'Scan' }: BarcodeScannerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const [error, setError]     = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [decoding, setDecoding] = useState(false);

  // ── Photo-capture mode: auto-open camera as soon as dialog is triggered ──
  useEffect(() => {
    if (!open || LIVE_CAMERA_AVAILABLE) return;
    setError(null);
    // Use a 0-ms timeout so the DOM finishes painting before we click,
    // keeping us within iOS's user-gesture window.
    const t = setTimeout(() => fileRef.current?.click(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // ── Live-video mode ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !LIVE_CAMERA_AVAILABLE) return;
    const reader = new BrowserMultiFormatReader();
    setError(null);
    setScanning(true);

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const preferred =
          devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        await reader.decodeFromVideoDevice(
          preferred?.deviceId,
          videoRef.current!,
          (result, err) => {
            if (result) { onScan(result.getText()); onClose(); }
            if (err && err.name !== 'NotFoundException')
              console.debug('[scanner]', err.name);
          },
        );
      } catch (e) {
        setError(
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Camera permission denied — please allow camera access.'
            : `Camera unavailable: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      } finally { setScanning(false); }
    })();

    return () => {
      try { (reader as unknown as { reset?: () => void }).reset?.(); } catch { /**/ }
    };
  }, [open]);

  // ── Handle photo selected by the file input ───────────────────────────────
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';   // reset so same photo can be retried
    if (!file) { onClose(); return; }

    setDecoding(true);
    setError(null);
    try {
      const text = await decodeBarcode(file);
      onScan(text);
      onClose();
    } catch {
      setError('No barcode detected. Move closer, ensure good lighting, then tap Try Again.');
    } finally {
      setDecoding(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // The file input must stay in the DOM at all times so the ref is valid
  // when useEffect fires and calls .click().
  const photoInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={handlePhotoCapture}
    />
  );

  if (!LIVE_CAMERA_AVAILABLE) {
    return (
      <>
        {photoInput}
        {/* Only show a dialog when we have something to tell the user */}
        {(decoding || error) && (
          <Dialog open={open} onClose={onClose} title={`Scan — ${label}`}>
            <div className="flex flex-col gap-3 py-2">
              {decoding && (
                <div className="text-center py-6 text-gray-500 text-sm">
                  ⟳ Decoding barcode…
                </div>
              )}
              {error && (
                <>
                  <div className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</div>
                  <Button onClick={() => { setError(null); fileRef.current?.click(); }}>
                    📷 Try Again
                  </Button>
                  <Button variant="secondary" onClick={onClose}>Cancel</Button>
                </>
              )}
            </div>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Scan — ${label}`}>
      <div className="flex flex-col gap-3">
        {error ? (
          <div className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</div>
        ) : (
          <>
            <div
              className="relative bg-black rounded-xl overflow-hidden"
              style={{ aspectRatio: '4/3' }}
            >
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

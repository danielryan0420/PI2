import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { BarcodeScanner } from './BarcodeScanner';
import { PhotoCapture } from './PhotoCapture';
import type { Count, SlocConfig } from '../../types';

interface CountFormProps {
  onSubmitted: (count: Count) => void;
  prefill?: { material_number?: string; sloc?: string; wm_bin?: string | null; zbin?: string | null };
  onPrefillConsumed?: () => void;
}

type ScanTarget = 'material' | 'wm_bin' | 'zbin';

export function CountForm({ onSubmitted, prefill, onPrefillConsumed }: CountFormProps) {
  const { username, role, session, slocConfigs } = useSession();
  const { toast } = useToast();

  const [materialNumber, setMaterialNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [sloc, setSloc] = useState('');
  const [wmBin, setWmBin] = useState('');
  const [zbin, setZbin] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastCountId, setLastCountId] = useState<number | null>(null);
  const [materialDesc, setMaterialDesc] = useState<string | null>(null);
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [recountBanner, setRecountBanner] = useState(false);

  const materialRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const wmBinRef = useRef<HTMLInputElement>(null);
  const zbinRef = useRef<HTMLInputElement>(null);

  // Always auto-focus material number on load
  useEffect(() => { materialRef.current?.focus(); }, []);

  // Apply prefill when provided (recount)
  useEffect(() => {
    if (!prefill) return;
    setMaterialNumber(prefill.material_number ?? '');
    setSloc(prefill.sloc ?? '');
    setWmBin(prefill.wm_bin ?? '');
    setZbin(prefill.zbin ?? '');
    setQuantity('');
    setRecountBanner(true);
    onPrefillConsumed?.();
    setTimeout(() => quantityRef.current?.focus(), 50);
  }, [prefill]);

  const slocConf: SlocConfig | undefined = slocConfigs.find((c) => c.sloc === sloc);
  const needsWmBin = slocConf?.wm_enabled === 1;
  const needsZbin = slocConf?.im_enabled === 1;

  // Lookup material description when material number changes
  useEffect(() => {
    if (materialNumber.trim().length < 3) { setMaterialDesc(null); return; }
    const timer = setTimeout(async () => {
      try {
        // We use the sloc-config endpoint as proxy; actually fetch from materials
        const res = await fetch(`/api/sessions/${session?.id}/counts?material=${encodeURIComponent(materialNumber)}&limit=1`);
        // Just try to hit sap_materials directly via a small endpoint
        const matRes = await fetch(`/api/materials/${encodeURIComponent(materialNumber)}`);
        if (matRes.ok) {
          const m = await matRes.json() as { description?: string };
          setMaterialDesc(m.description ?? null);
        }
      } catch { setMaterialDesc(null); }
    }, 400);
    return () => clearTimeout(timer);
  }, [materialNumber, session?.id]);

  const slocOptions = slocConfigs.map((c) => ({
    value: c.sloc,
    label: c.description ? `${c.sloc} — ${c.description}` : c.sloc,
  }));

  function handleScan(value: string) {
    const cleaned = value.trim();
    if (scanTarget === 'material') { setMaterialNumber(cleaned.toUpperCase()); quantityRef.current?.focus(); }
    if (scanTarget === 'wm_bin') { setWmBin(cleaned.toUpperCase()); zbinRef.current?.focus(); }
    if (scanTarget === 'zbin') { setZbin(cleaned.toUpperCase()); quantityRef.current?.focus(); }
    setScanTarget(null);
  }

  // Handle Enter key on each field to advance focus (Zebra scanner terminator)
  function handleMaterialKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      setMaterialNumber((v) => v.trim().toUpperCase());
      if (needsWmBin) wmBinRef.current?.focus();
      else if (needsZbin) zbinRef.current?.focus();
      else quantityRef.current?.focus();
    }
  }

  function handleWmBinKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); quantityRef.current?.focus(); }
  }

  function handleZbinKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); quantityRef.current?.focus(); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) { toast('No active session', 'error'); return; }
    if (!materialNumber.trim()) { toast('Material number required', 'error'); return; }
    if (!quantity || isNaN(Number(quantity))) { toast('Valid quantity required', 'error'); return; }
    if (!sloc) { toast('Storage location required', 'error'); return; }
    if (needsWmBin && !wmBin.trim()) { toast('WM Bin required for this SLOC', 'error'); return; }
    if (needsZbin && !zbin.trim()) { toast('ZBIN required for this SLOC', 'error'); return; }

    setSubmitting(true);
    try {
      const count = await api.post<Count>(`/sessions/${session.id}/counts`, {
        username,
        material_number: materialNumber.trim().toUpperCase(),
        quantity: Number(quantity),
        sloc,
        wm_bin: needsWmBin ? wmBin.trim().toUpperCase() : undefined,
        zbin: needsZbin ? zbin.trim().toUpperCase() : undefined,
      });

      // Send question if one was entered
      if (question.trim()) {
        await api.post(`/counts/${count.id}/messages`, { sender: username, role, body: question.trim() });
        setQuestion('');
      }

      setLastCountId(count.id);
      toast(`Count #${count.id} saved`, 'success');
      onSubmitted(count);

      // Reset scannable fields, keep SLOC and username
      setMaterialNumber('');
      setQuantity('');
      setWmBin('');
      setZbin('');
      setMaterialDesc(null);

      // Re-focus material number for next scan
      setTimeout(() => materialRef.current?.focus(), 50);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Recount banner */}
      {recountBanner && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
          <span className="text-sm text-amber-700 font-medium">⚠ Recount — fields pre-filled. Enter new quantity.</span>
          <button type="button" onClick={() => setRecountBanner(false)} className="text-amber-500 hover:text-amber-700 text-lg leading-none">×</button>
        </div>
      )}

      {/* Username (read-only display) */}
      <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
        <span className="text-sm text-blue-700 font-medium">Counter: {username}</span>
        {session && <span className="text-xs text-blue-500">{session.name}</span>}
      </div>

      {/* Material Number */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Material Number <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <input
            ref={materialRef}
            value={materialNumber}
            onChange={(e) => setMaterialNumber(e.target.value.toUpperCase())}
            onKeyDown={handleMaterialKeyDown}
            placeholder="e.g. 100-00001 or scan"
            className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            inputMode="text"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setScanTarget('material')}
            className="no-min-h px-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-lg"
            title="Scan barcode (camera)"
          >
            📷
          </button>
        </div>
        {materialDesc && (
          <p className="text-xs text-gray-500 mt-0.5 ml-1">{materialDesc}</p>
        )}
      </div>

      {/* SLOC */}
      <Select
        label="Storage Location (SLOC)"
        value={sloc}
        onChange={(e) => { setSloc(e.target.value); setWmBin(''); setZbin(''); }}
        options={slocOptions}
        placeholder="Select SLOC..."
        required
      />

      {/* WM Bin — only for WM-enabled SLOCs */}
      {needsWmBin && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            WM Bin <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              ref={wmBinRef}
              value={wmBin}
              onChange={(e) => setWmBin(e.target.value.toUpperCase())}
              onKeyDown={handleWmBinKeyDown}
              placeholder="Scan or type WM bin"
              className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setScanTarget('wm_bin')}
              className="no-min-h px-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-lg"
            >
              📷
            </button>
          </div>
        </div>
      )}

      {/* ZBIN — only for IM-enabled SLOCs */}
      {needsZbin && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            ZBIN <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              ref={zbinRef}
              value={zbin}
              onChange={(e) => setZbin(e.target.value.toUpperCase())}
              onKeyDown={handleZbinKeyDown}
              placeholder="Scan or type ZBIN"
              className="flex-1 min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setScanTarget('zbin')}
              className="no-min-h px-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-lg"
            >
              📷
            </button>
          </div>
        </div>
      )}

      {/* Quantity */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Quantity <span className="text-red-500">*</span>
        </label>
        <input
          ref={quantityRef}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e as unknown as React.FormEvent)}
          placeholder="0"
          className="w-full min-h-[44px] px-3 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Optional question for office */}
      <details className="bg-amber-50 rounded-lg">
        <summary className="px-3 py-2 text-sm text-amber-700 cursor-pointer font-medium">
          ❓ Ask office a question (optional)
        </summary>
        <div className="px-3 pb-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type your question here…"
            rows={3}
          />
        </div>
      </details>

      {/* Photo attachment — only after first submission */}
      {lastCountId && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">Attach photo to count #{lastCountId}:</p>
          <PhotoCapture countId={lastCountId} />
        </div>
      )}

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        ✓ Submit Count
      </Button>

      {/* Barcode scanner modal */}
      <BarcodeScanner
        open={scanTarget !== null}
        onClose={() => setScanTarget(null)}
        onScan={handleScan}
        label={scanTarget === 'material' ? 'Material Number' : scanTarget === 'wm_bin' ? 'WM Bin' : 'ZBIN'}
      />
    </form>
  );
}

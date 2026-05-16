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
  prefill?: { original_count_id?: number; material_number?: string; sloc?: string; wm_bin?: string | null; zbin?: string | null };
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
  const [originalCountId, setOriginalCountId] = useState<number | null>(null);
  const [materialWarning, setMaterialWarning] = useState<string | null>(null);
  const [binWarning, setBinWarning] = useState<string | null>(null);
  const [fixedBinWarning, setFixedBinWarning] = useState<string | null>(null);
  const [openOrderWarnings, setOpenOrderWarnings] = useState<string[]>([]);

  const materialRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const wmBinRef = useRef<HTMLInputElement>(null);
  const zbinRef = useRef<HTMLInputElement>(null);

  // Load form state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('countFormState');
    if (saved) {
      try {
        const { materialNumber: m, quantity: q, sloc: s, wmBin: w, zbin: z, question: qu } = JSON.parse(saved);
        if (m) setMaterialNumber(m);
        if (q) setQuantity(q);
        if (s) setSloc(s);
        if (w) setWmBin(w);
        if (z) setZbin(z);
        if (qu) setQuestion(qu);
      } catch { /* ignore malformed */ }
    }
    materialRef.current?.focus();
  }, []);

  // Save form state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('countFormState', JSON.stringify({
      materialNumber, quantity, sloc, wmBin, zbin, question
    }));
  }, [materialNumber, quantity, sloc, wmBin, zbin, question]);

  // Apply prefill when provided (recount)
  useEffect(() => {
    if (!prefill) return;
    setOriginalCountId(prefill.original_count_id ?? null);
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

  // Lookup material description and validate existence when material number changes
  useEffect(() => {
    if (materialNumber.trim().length < 3) { setMaterialDesc(null); setMaterialWarning(null); setOpenOrderWarnings([]); return; }
    const timer = setTimeout(async () => {
      try {
        const matRes = await fetch(`/api/materials/${encodeURIComponent(materialNumber)}`);
        if (matRes.ok) {
          const m = await matRes.json() as { description?: string };
          setMaterialDesc(m.description ?? null);
          setMaterialWarning(null);
        } else {
          setMaterialDesc(null);
          setMaterialWarning(`⚠️ Material ${materialNumber.toUpperCase()} not in Master Data. You can still submit, admin will be notified.`);
        }
      } catch { setMaterialDesc(null); setMaterialWarning(null); }

      // Check for open POs, production orders, and reservations
      try {
        const ordRes = await fetch(`/api/validate/open-orders?material=${encodeURIComponent(materialNumber.trim())}`);
        if (ordRes.ok) {
          const ord = await ordRes.json() as {
            has_open_pos: boolean; has_open_orders: boolean; has_open_reservations: boolean;
            open_pos: Array<{ebeln: string; open_qty: number; meins: string}>;
            open_orders: Array<{aufnr: string; open_qty: number; gmein: string; sysst: string}>;
            open_reservations: Array<{rsnum: string; remaining_qty: number; aufnr: string; ebeln: string}>;
          };
          const warns: string[] = [];
          if (ord.has_open_pos) {
            const total = ord.open_pos.reduce((s, p) => s + p.open_qty, 0);
            warns.push(`⚠ Open PO: ${ord.open_pos.length} purchase order(s) with ${total.toFixed(0)} units not yet received. Verify stock is not already in transit before counting.`);
          }
          if (ord.has_open_orders) {
            const total = ord.open_orders.reduce((s, o) => s + o.open_qty, 0);
            warns.push(`⚠ Open Production/Process Order: ${ord.open_orders.length} order(s) with ${total.toFixed(0)} units not yet delivered. Stock may change before physical inventory is posted.`);
          }
          if (ord.has_open_reservations) {
            const total = ord.open_reservations.reduce((s, r) => s + r.remaining_qty, 0);
            warns.push(`⚠ Open Reservation: ${ord.open_reservations.length} reservation(s) require ${total.toFixed(0)} units to be issued. Confirm this stock should be counted as on-hand.`);
          }
          setOpenOrderWarnings(warns);
        }
      } catch { setOpenOrderWarnings([]); }
    }, 600);
    return () => clearTimeout(timer);
  }, [materialNumber, session?.id]);

  // Validate WM bin existence when it changes
  useEffect(() => {
    if (!needsWmBin || wmBin.trim().length < 2) { setBinWarning(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/validate/wm-bin/${encodeURIComponent(wmBin)}`);
        if (res.ok) {
          const data = await res.json() as { exists: boolean };
          if (!data.exists) {
            setBinWarning(`⚠️ WM Bin ${wmBin.toUpperCase()} not found. You can still submit, admin will be notified.`);
          } else {
            setBinWarning(null);
          }
        }
      } catch { setBinWarning(null); }
    }, 400);
    return () => clearTimeout(timer);
  }, [wmBin, needsWmBin]);

  // Validate fixed bin assignment for storage-type-100 bins
  useEffect(() => {
    if (!needsWmBin || wmBin.trim().length < 2 || materialNumber.trim().length < 3) {
      setFixedBinWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/validate/fixed-bin?material=${encodeURIComponent(materialNumber.trim())}&wm_bin=${encodeURIComponent(wmBin.trim())}`
        );
        if (res.ok) {
          const data = await res.json() as {
            is_fixed_bin_type: boolean;
            has_assignment: boolean;
            expected_bin: string | null;
            matches: boolean;
          };
          if (data.is_fixed_bin_type && data.has_assignment && !data.matches) {
            setFixedBinWarning(
              `⚠️ Fixed bin mismatch: ${materialNumber.trim().toUpperCase()} is assigned to bin ${data.expected_bin}, not ${wmBin.trim().toUpperCase()}.`
            );
          } else {
            setFixedBinWarning(null);
          }
        }
      } catch { setFixedBinWarning(null); }
    }, 400);
    return () => clearTimeout(timer);
  }, [materialNumber, wmBin, needsWmBin]);

  const slocOptions = slocConfigs.map((c) => ({
    value: c.sloc,
    label: c.description ? `${c.sloc} — ${c.description}` : c.sloc,
  }));

  function handleScan(value: string) {
    const cleaned = value.trim();
    if (scanTarget === 'material') {
      setMaterialNumber(cleaned.toUpperCase());
      // Defer focus until after dialog closes
      setTimeout(() => {
        if (needsWmBin) wmBinRef.current?.focus();
        else if (needsZbin) zbinRef.current?.focus();
        else quantityRef.current?.focus();
      }, 100);
    }
    if (scanTarget === 'wm_bin') {
      setWmBin(cleaned.toUpperCase());
      setTimeout(() => {
        if (needsZbin) zbinRef.current?.focus();
        else quantityRef.current?.focus();
      }, 100);
    }
    if (scanTarget === 'zbin') {
      setZbin(cleaned.toUpperCase());
      setTimeout(() => quantityRef.current?.focus(), 100);
    }
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
      const warnings: string[] = [];
      if (materialWarning) warnings.push('material_not_found');
      if (binWarning) warnings.push('wm_bin_not_found');
      if (fixedBinWarning) warnings.push('fixed_bin_mismatch');

      let count: Count;
      if (originalCountId) {
        // Recount: update the existing flagged record instead of creating a new one
        count = await api.patch<Count>(`/counts/${originalCountId}`, {
          quantity: Number(quantity),
          status: 'pending',
          editor_username: username,
          reason: 'Recount submitted',
        }, { username, role: role ?? undefined });
        setOriginalCountId(null);
        setRecountBanner(false);
      } else {
        count = await api.post<Count>(`/sessions/${session.id}/counts`, {
          username,
          material_number: materialNumber.trim().toUpperCase(),
          quantity: Number(quantity),
          sloc,
          wm_bin: needsWmBin ? wmBin.trim().toUpperCase() : undefined,
          zbin: needsZbin ? zbin.trim().toUpperCase() : undefined,
          validation_warnings: warnings.length > 0 ? JSON.stringify(warnings) : undefined,
        });
      }

      // Send question as a thread so it shows up in the office dashboard
      if (question.trim()) {
        await api.post(`/sessions/${session.id}/threads`, { title: question.trim(), count_id: count.id }, { username, role: role ?? undefined });
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
      setQuestion('');
      setMaterialWarning(null);
      setBinWarning(null);
      setFixedBinWarning(null);
      setOpenOrderWarnings([]);
      localStorage.setItem('countFormState', JSON.stringify({
        materialNumber: '', quantity: '', sloc, wmBin: '', zbin: '', question: ''
      }));

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
            className={`flex-1 min-h-[44px] px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 uppercase ${materialWarning ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
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
        {materialWarning && (
          <p className="text-xs text-red-600 mt-0.5 ml-1 bg-red-50 px-2 py-1 rounded">{materialWarning}</p>
        )}
        {materialDesc && !materialWarning && (
          <p className="text-xs text-gray-500 mt-0.5 ml-1">{materialDesc}</p>
        )}
        {openOrderWarnings.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {openOrderWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">{w}</p>
            ))}
          </div>
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
              className={`flex-1 min-h-[44px] px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 uppercase ${(binWarning || fixedBinWarning) ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
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
          {binWarning && (
            <p className="text-xs text-red-600 mt-0.5 ml-1 bg-red-50 px-2 py-1 rounded">{binWarning}</p>
          )}
          {fixedBinWarning && (
            <p className="text-xs text-orange-700 mt-0.5 ml-1 bg-orange-50 border border-orange-200 px-2 py-1 rounded">{fixedBinWarning}</p>
          )}
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

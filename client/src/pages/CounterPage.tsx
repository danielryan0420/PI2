import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { CountForm } from '../components/count/CountForm';
import { CountCard } from '../components/count/CountCard';
import { MessagesPanel } from '../components/count/MessagesPanel';
import { HelpButton } from '../components/ui/HelpDialog';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { Count, Message } from '../types';

const COUNTER_HELP = {
  'count': [
    {
      title: 'Entering a Count',
      bullets: [
        'Type or scan the material number — the system will look it up automatically.',
        'Enter the quantity you physically counted.',
        'Select the storage location (SLOC) where you counted it.',
        'If counting in a WM warehouse, enter the bin number.',
        'Hit Submit. The count appears in your history on the right.',
      ],
    },
    {
      title: 'Barcode Scanning',
      bullets: [
        'Camera scan: tap the Scan button and point at the barcode.',
        'Zebra scanner: pair via Bluetooth in keyboard mode — scan the barcode then press Enter.',
        'HTTPS is required for camera scanning on phones — ask your admin if the camera button is missing.',
      ],
    },
    {
      title: 'Attaching Photos',
      bullets: [
        'Use the photo button on the count form to attach one or more photos.',
        'Useful for documenting damaged goods, odd locations, or anything unusual.',
      ],
    },
    {
      title: 'Flagged Counts',
      bullets: [
        'If the office flags your count, it will appear red in your history.',
        'Click Recount on the flagged item to re-enter it — the original record is updated, not duplicated.',
      ],
    },
    {
      title: 'Warnings',
      bullets: [
        'An amber warning means this material has an open purchase order, production order, or reservation.',
        'This is informational — count what you physically see and let the office know if something looks wrong.',
      ],
    },
  ],
  'messages': [
    {
      title: 'Asking the Office a Question',
      bullets: [
        'Use the Messages tab to send a question about any material or location.',
        'The office sees your question on their dashboard and can reply here.',
        'A badge on the Messages tab shows unread replies.',
      ],
    },
  ],
};

export function CounterPage() {
  const { username, session } = useSession();
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'count' | 'messages'>('count');
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [recountPrefill, setRecountPrefill] = useState<{ original_count_id?: number; material_number?: string; sloc?: string; wm_bin?: string | null; zbin?: string | null } | undefined>(undefined);

  useEffect(() => {
    if (!session) return;

    const loadCounts = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.get<Count[]>(`/sessions/${session.id}/counts/mine`, { username });
        setCounts(prev => {
          if (prev.length === data.length && JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      } catch { }
      finally { if (!silent) setLoading(false); }
    };

    loadCounts(false);
    const interval = setInterval(() => loadCounts(true), 5000);
    return () => clearInterval(interval);
  }, [session?.id, username]);

  function handleSubmitted(count: Count) {
    setCounts((prev) => {
      if (prev.find((c) => c.id === count.id)) {
        return prev.map((c) => c.id === count.id ? count : c);
      }
      return [count, ...prev];
    });
  }

  function handleTabChange(t: 'count' | 'messages') {
    setTab(t);
    if (t === 'messages') setUnreadReplies(0);
  }

  function handleRecount(count: Count) {
    setRecountPrefill({
      original_count_id: count.id,
      material_number: count.material_number,
      sloc: count.sloc,
      wm_bin: count.wm_bin,
      zbin: count.zbin,
    });
    setTab('count');
  }

  const pending = counts.filter((c) => c.status === 'pending').length;
  const verified = counts.filter((c) => c.status === 'verified').length;
  const flagged = counts.filter((c) => c.status === 'flagged').length;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">

        {/* Tab switcher */}
        <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => handleTabChange('count')}
            className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'count' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Count Entry
          </button>
          <button
            onClick={() => handleTabChange('messages')}
            className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'messages' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Messages
            {unreadReplies > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {unreadReplies}
              </span>
            )}
          </button>
        </div>
          <HelpButton
            title={tab === 'count' ? 'Count Entry Help' : 'Messages Help'}
            sections={COUNTER_HELP[tab]}
          />
        </div>

        {tab === 'count' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* LEFT: Entry form */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Enter Count</h2>
              <CountForm
                onSubmitted={handleSubmitted}
                prefill={recountPrefill}
                onPrefillConsumed={() => setRecountPrefill(undefined)}
              />
            </div>

            {/* RIGHT: My count history */}
            <div className="flex flex-col gap-3">
              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-blue-700">{pending}</div>
                  <div className="text-xs text-blue-500">Counted</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-green-700">{verified}</div>
                  <div className="text-xs text-green-500">Verified</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-red-700">{flagged}</div>
                  <div className="text-xs text-red-500">Flagged</div>
                </div>
              </div>

              {/* Count list */}
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-gray-600">My Counts ({counts.length})</h2>
                {loading ? (
                  <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
                ) : counts.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-dashed border-gray-300">
                    No counts yet — submit your first count using the form
                  </div>
                ) : (
                  counts.map((count) => <CountCard key={count.id} count={count} onRecount={handleRecount} />)
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'messages' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 max-w-2xl">
            <MessagesPanel />
          </div>
        )}

      </div>
    </AppShell>
  );
}

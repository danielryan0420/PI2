import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { CountForm } from '../components/count/CountForm';
import { CountCard } from '../components/count/CountCard';
import { MessagesPanel } from '../components/count/MessagesPanel';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { Count, Message } from '../types';

export function CounterPage() {
  const { username, session } = useSession();
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'count' | 'messages'>('count');
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [recountPrefill, setRecountPrefill] = useState<{ original_count_id?: number; material_number?: string; sloc?: string; wm_bin?: string | null; zbin?: string | null } | undefined>(undefined);

  useEffect(() => {
    if (!session) return;

    api.get<Count[]>(`/sessions/${session.id}/counts/mine`, { username })
      .then(setCounts)
      .catch(() => {})
      .finally(() => setLoading(false));
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
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
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

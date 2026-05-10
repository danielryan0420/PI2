import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import { formatDateTime, formatCurrency, formatNumber } from '../lib/utils';
import type {
  DashboardStats,
  MaterialStatus,
  VarianceRow,
  AuditEntry,
  HighValueItem,
  SlocBreakdown,
  CounterActivity,
  CountTrend,
} from '../types';

// ─── Local types ────────────────────────────────────────────────────────────

interface ProblemMaterial {
  material_number: string;
  description: string | null;
  movement_count: number;
  adj_count: number;
  transfer_count: number;
  issue_count: number;
  last_movement: string | null;
  movement_types: string;
}

type DashTab = 'overview' | 'materials' | 'variance' | 'problems' | 'audit';

type SortField = 'material_number' | 'sloc' | 'sap_quantity' | 'counted_qty' | 'variance' | 'total_value' | 'derived_status';
type SortDir = 'asc' | 'desc';

// ─── Main Page ───────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { role, username, session } = useSession();
  const headers = { role: role ?? '', username };

  // ─ data state ─
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [materialStatus, setMaterialStatus] = useState<MaterialStatus[]>([]);
  const [variance, setVariance] = useState<VarianceRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [problems, setProblems] = useState<ProblemMaterial[]>([]);

  // ─ ui state ─
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [loading, setLoading] = useState(true);
  const [matFilter, setMatFilter] = useState('');
  const [matStatusFilter, setMatStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('material_number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─ data loaders ─
  const loadSummary = useCallback(async () => {
    if (!session) return;
    try {
      const s = await api.get<DashboardStats>(`/sessions/${session.id}/dashboard/summary`, headers);
      setStats(s);
    } catch (e) {
      console.error('Dashboard summary error:', e);
    }
  }, [session?.id]);

  const loadMaterials = useCallback(async () => {
    if (!session) return;
    try {
      const ms = await api.get<MaterialStatus[]>(`/sessions/${session.id}/dashboard/materials`, headers);
      setMaterialStatus(ms);
    } catch (e) {
      console.error('Materials load error:', e);
    }
  }, [session?.id]);

  const loadVariance = useCallback(async () => {
    if (!session) return;
    try {
      const v = await api.get<VarianceRow[]>(`/sessions/${session.id}/dashboard/discrepancies`, headers);
      setVariance(v);
    } catch (e) {
      console.error('Variance load error:', e);
    }
  }, [session?.id]);

  const loadAudit = useCallback(async () => {
    if (!session) return;
    try {
      const data = await api.get<AuditEntry[]>(`/sessions/${session.id}/audit`, headers);
      setAudit(data);
    } catch (e) {
      console.error('Audit load error:', e);
    }
  }, [session?.id]);

  const loadProblems = useCallback(async () => {
    try {
      const data = await api.get<ProblemMaterial[]>('/dashboard/problem-materials', headers);
      setProblems(data);
    } catch (e) {
      console.error('Problem materials load error:', e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadMaterials(), loadVariance(), loadAudit(), loadProblems()]);
    setLastUpdated(new Date());
    setSecondsAgo(0);
    setLoading(false);
  }, [loadSummary, loadMaterials, loadVariance, loadAudit, loadProblems]);

  const refreshOverview = useCallback(async () => {
    await loadSummary();
    setLastUpdated(new Date());
    setSecondsAgo(0);
  }, [loadSummary]);

  // ─ initial load ─
  useEffect(() => {
    if (session) {
      setLoading(true);
      loadAll();
    }
  }, [session?.id]);

  // ─ auto-refresh overview every 60s ─
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (activeTab === 'overview' && session) {
      autoRefreshRef.current = setInterval(refreshOverview, 60_000);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [activeTab, session?.id, refreshOverview]);

  // ─ seconds-ago ticker ─
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 5_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [lastUpdated]);

  // ─ derived material list ─
  const filteredMaterials = React.useMemo(() => {
    let list = materialStatus;
    if (matFilter.trim()) {
      const q = matFilter.toLowerCase();
      list = list.filter(
        (m) =>
          m.material_number.toLowerCase().includes(q) ||
          (m.description ?? '').toLowerCase().includes(q) ||
          m.sloc.toLowerCase().includes(q)
      );
    }
    if (matStatusFilter !== 'all') {
      list = list.filter((m) => m.derived_status === matStatusFilter);
    }
    return [...list].sort((a, b) => {
      let av: string | number = a[sortField] ?? '';
      let bv: string | number = b[sortField] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [materialStatus, matFilter, matStatusFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleManualRefresh = () => {
    if (activeTab === 'overview') refreshOverview();
    else loadAll();
  };

  // ─ no session guard ─
  if (!session) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
          <span className="text-3xl">📋</span>
          <p className="text-sm">Select a session to view the dashboard.</p>
        </div>
      </AppShell>
    );
  }

  const TABS: { id: DashTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'materials', label: 'Materials' },
    { id: 'variance', label: 'Variance' },
    { id: 'problems', label: 'Problem Materials' },
    { id: 'audit', label: 'Audit Log' },
  ];

  const lastUpdatedStr = lastUpdated
    ? secondsAgo < 10
      ? 'just now'
      : secondsAgo < 60
      ? `${secondsAgo}s ago`
      : `${Math.floor(secondsAgo / 60)}m ago`
    : null;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-0">

        {/* ─── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 pb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              Dashboard — {session.name}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Session #{session.id}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {lastUpdatedStr && (
              <span className="text-xs text-gray-400 hidden sm:block">Updated {lastUpdatedStr}</span>
            )}
            <button
              onClick={handleManualRefresh}
              className="no-min-h text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ─── Tab nav ─────────────────────────────────────────────────── */}
        <div className="overflow-x-auto border-b border-gray-200 -mx-3 sm:-mx-6 px-3 sm:px-6">
          <nav className="flex gap-0 min-w-max">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'no-min-h px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                {tab.label}
                {tab.id === 'overview' && stats?.unread_messages ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                    {stats.unread_messages > 9 ? '9+' : stats.unread_messages}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        {/* ─── Tab content ─────────────────────────────────────────────── */}
        <div className="pt-4">
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab stats={stats} />
              )}
              {activeTab === 'materials' && (
                <MaterialsTab
                  materials={filteredMaterials}
                  totalCount={materialStatus.length}
                  filter={matFilter}
                  onFilterChange={setMatFilter}
                  statusFilter={matStatusFilter}
                  onStatusFilterChange={setMatStatusFilter}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  snapshotLoaded={stats?.snapshot_loaded ?? false}
                />
              )}
              {activeTab === 'variance' && (
                <VarianceTab variance={variance} />
              )}
              {activeTab === 'problems' && (
                <ProblemsTab problems={problems} />
              )}
              {activeTab === 'audit' && (
                <AuditLog audit={audit} />
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
            <div className="h-8 bg-gray-100 rounded w-1/2" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
            <div className="h-2 bg-gray-100 rounded mt-1" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 h-48" />
        <div className="bg-white rounded-xl border border-gray-200 p-4 h-48" />
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: DashboardStats | null }) {
  const navigate = useNavigate();

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
        <p className="text-sm">No data available. Try refreshing.</p>
      </div>
    );
  }

  const { totals, first_pass_yield, first_pass_count, snapshot_loaded, snapshot_total, snapshot_counted, unread_messages } = stats;

  const fpyColor =
    first_pass_yield === null
      ? 'text-gray-400'
      : first_pass_yield >= 80
      ? 'text-green-700'
      : first_pass_yield >= 60
      ? 'text-amber-600'
      : 'text-red-600';

  const fpyBarColor =
    first_pass_yield === null
      ? 'bg-gray-300'
      : first_pass_yield >= 80
      ? 'bg-green-500'
      : first_pass_yield >= 60
      ? 'bg-amber-400'
      : 'bg-red-500';

  const snapshotPct =
    snapshot_loaded && snapshot_total > 0
      ? Math.min(100, Math.round((snapshot_counted / snapshot_total) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Row 1: KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {/* Card 1: Count Status */}
        <Card>
          <CardBody className="flex flex-col gap-1 py-4">
            <div className="text-3xl font-bold text-gray-900 leading-none">
              {formatNumber(totals.total, 0)}
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Count Status</div>
            {totals.total > 0 ? (
              <>
                <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-px">
                  {totals.pending > 0 && (
                    <div
                      className="bg-blue-400 transition-all"
                      style={{ width: `${(totals.pending / totals.total) * 100}%` }}
                      title={`${totals.pending} counted`}
                    />
                  )}
                  {totals.verified > 0 && (
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(totals.verified / totals.total) * 100}%` }}
                      title={`${totals.verified} verified`}
                    />
                  )}
                  {totals.flagged > 0 && (
                    <div
                      className="bg-red-400 transition-all"
                      style={{ width: `${(totals.flagged / totals.total) * 100}%` }}
                      title={`${totals.flagged} flagged`}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] font-medium">
                  <span className="text-blue-600">{formatNumber(totals.pending, 0)} Counted</span>
                  <span className="text-green-600">{formatNumber(totals.verified, 0)} Verified</span>
                  <span className="text-red-500">{formatNumber(totals.flagged, 0)} Flagged</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 mt-1">No counts yet</p>
            )}
          </CardBody>
        </Card>

        {/* Card 2: First Pass Yield */}
        <Card>
          <CardBody className="flex flex-col gap-1 py-4">
            <div className={`text-3xl font-bold leading-none ${fpyColor}`}>
              {first_pass_yield !== null ? `${first_pass_yield}%` : '—'}
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">First Pass Yield</div>
            <div className="mt-2 w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`${fpyBarColor} h-2.5 rounded-full transition-all duration-500`}
                style={{ width: `${first_pass_yield ?? 0}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {formatNumber(first_pass_count, 0)} of {formatNumber(totals.verified, 0)} verified first try
            </p>
          </CardBody>
        </Card>

        {/* Card 3: Snapshot Progress */}
        <Card>
          <CardBody className="flex flex-col gap-1 py-4">
            <div className="text-3xl font-bold text-blue-700 leading-none">
              {snapshot_loaded ? `${snapshot_counted}/${snapshot_total}` : '—'}
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Snapshot Progress</div>
            {snapshot_loaded && snapshot_total > 0 ? (
              <>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${snapshotPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-blue-600 font-semibold mt-0.5">{snapshotPct}% complete</p>
              </>
            ) : (
              <p className="text-[11px] text-amber-500 mt-2 bg-amber-50 rounded-md px-2 py-1">
                Load snapshot in SAP Data tab
              </p>
            )}
          </CardBody>
        </Card>

        {/* Card 4: Open Questions — clickable, goes to /review */}
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${unread_messages > 0 ? 'ring-2 ring-amber-300' : ''}`}
          onClick={() => navigate('/review')}
        >
          <CardBody className="flex flex-col gap-1 py-4">
            <div className={`text-3xl font-bold leading-none ${unread_messages > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatNumber(unread_messages, 0)}
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unanswered Questions</div>
            {unread_messages > 0 ? (
              <span className="mt-2 self-start inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Click to answer →
              </span>
            ) : (
              <p className="text-[11px] text-green-600 mt-2">All caught up</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Row 2: Donut + SLOC Breakdown ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut chart */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800 text-sm">Count Distribution</h2>
          </CardHeader>
          <CardBody className="flex flex-col items-center py-4">
            <DonutChart
              pending={totals.pending}
              verified={totals.verified}
              flagged={totals.flagged}
              total={totals.total}
            />
            <div className="flex gap-4 mt-3 text-xs font-medium">
              <LegendDot color="bg-blue-400" label="Counted" value={totals.pending} />
              <LegendDot color="bg-green-500" label="Verified" value={totals.verified} />
              <LegendDot color="bg-red-400" label="Flagged" value={totals.flagged} />
            </div>
          </CardBody>
        </Card>

        {/* SLOC breakdown */}
        {stats.sloc_breakdown.length > 0 ? (
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-800 text-sm">Counts by SLOC</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {stats.sloc_breakdown.map((s: SlocBreakdown) => (
                <div key={s.sloc}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-mono font-semibold text-gray-800 text-sm">{s.sloc}</span>
                    <span className="text-xs text-gray-400">{formatNumber(s.total, 0)} counts</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 gap-px">
                    {s.pending > 0 && (
                      <div
                        className="bg-blue-400 transition-all"
                        style={{ width: `${(s.pending / s.total) * 100}%` }}
                        title={`${s.pending} counted`}
                      />
                    )}
                    {s.verified > 0 && (
                      <div
                        className="bg-green-500 transition-all"
                        style={{ width: `${(s.verified / s.total) * 100}%` }}
                        title={`${s.verified} verified`}
                      />
                    )}
                    {s.flagged > 0 && (
                      <div
                        className="bg-red-400 transition-all"
                        style={{ width: `${(s.flagged / s.total) * 100}%` }}
                        title={`${s.flagged} flagged`}
                      />
                    )}
                  </div>
                  <div className="flex gap-3 text-[10px] mt-1">
                    {s.pending > 0 && <span className="text-blue-500">{formatNumber(s.pending, 0)} counted</span>}
                    {s.verified > 0 && <span className="text-green-600">{formatNumber(s.verified, 0)} verified</span>}
                    {s.flagged > 0 && <span className="text-red-500">{formatNumber(s.flagged, 0)} flagged</span>}
                    {s.pending === 0 && s.verified === 0 && s.flagged === 0 && (
                      <span className="text-gray-400">No counts yet</span>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader><h2 className="font-semibold text-gray-800 text-sm">Counts by SLOC</h2></CardHeader>
            <CardBody>
              <EmptyState message="No SLOC data available yet." />
            </CardBody>
          </Card>
        )}
      </div>

      {/* ── Row 3: Counter Activity ────────────────────────────────────── */}
      {stats.counter_activity.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800 text-sm">Counter Activity</h2>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">Counter</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-left w-36">Status Mix</th>
                  <th className="px-4 py-2.5 text-right hidden sm:table-cell">First Count</th>
                  <th className="px-4 py-2.5 text-right">Last Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.counter_activity.map((ca: CounterActivity) => (
                  <tr key={ca.username} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-gray-800">{ca.username}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      {formatNumber(ca.total, 0)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-px w-28">
                        {ca.pending > 0 && (
                          <div className="bg-blue-400" style={{ width: `${(ca.pending / ca.total) * 100}%` }} />
                        )}
                        {ca.verified > 0 && (
                          <div className="bg-green-500" style={{ width: `${(ca.verified / ca.total) * 100}%` }} />
                        )}
                        {ca.flagged > 0 && (
                          <div className="bg-red-400" style={{ width: `${(ca.flagged / ca.total) * 100}%` }} />
                        )}
                      </div>
                      <div className="flex gap-2 text-[10px] mt-0.5 font-medium">
                        <span className="text-blue-500">{ca.pending}C</span>
                        <span className="text-green-600">{ca.verified}V</span>
                        <span className="text-red-500">{ca.flagged}F</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400 hidden sm:table-cell whitespace-nowrap">
                      {formatDateTime(ca.first_count)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
                      {formatDateTime(ca.last_count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Row 4: Count Trend ────────────────────────────────────────── */}
      {stats.count_trend.length > 1 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800 text-sm">Count Activity — Last 24 Hours</h2>
          </CardHeader>
          <CardBody className="pt-2">
            <CountTrendChart trend={stats.count_trend} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ─── Materials Tab ────────────────────────────────────────────────────────────

const STATUS_ROW_BG: Record<string, string> = {
  not_counted: 'bg-white',
  pending:     'bg-blue-50',
  verified:    'bg-green-50',
  flagged:     'bg-red-50',
  variance:    'bg-orange-50',
};

const STATUS_OPTIONS = [
  { value: 'all',        label: 'All Statuses' },
  { value: 'not_counted', label: 'Not Counted' },
  { value: 'pending',    label: 'Counted' },
  { value: 'verified',   label: 'Verified' },
  { value: 'flagged',    label: 'Flagged' },
  { value: 'variance',   label: 'Variance' },
];

interface MaterialsTabProps {
  materials: MaterialStatus[];
  totalCount: number;
  filter: string;
  onFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  snapshotLoaded: boolean;
}

function MaterialsTab({
  materials,
  totalCount,
  filter,
  onFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortField,
  sortDir,
  onSort,
  snapshotLoaded,
}: MaterialsTabProps) {

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-blue-500 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Filter by material, description, SLOC…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="no-min-h px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-72"
        />
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="no-min-h px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {(filter || statusFilter !== 'all') && (
          <button
            onClick={() => { onFilterChange(''); onStatusFilterChange('all'); }}
            className="no-min-h text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded border border-gray-200 bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {totalCount === 0 && !snapshotLoaded ? (
            <div className="px-4 py-10 text-center">
              <EmptyState message="No snapshot loaded. Upload one in the SAP Data tab to track material status." />
            </div>
          ) : materials.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <EmptyState message="No materials match your filters." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  <th
                    className="px-3 py-3 text-left cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('material_number')}
                  >
                    Material <SortIcon field="material_number" />
                  </th>
                  <th
                    className="px-3 py-3 text-left cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('sloc')}
                  >
                    SLOC <SortIcon field="sloc" />
                  </th>
                  <th
                    className="px-3 py-3 text-right cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('sap_quantity')}
                  >
                    SAP Qty <SortIcon field="sap_quantity" />
                  </th>
                  <th
                    className="px-3 py-3 text-right cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('counted_qty')}
                  >
                    Counted <SortIcon field="counted_qty" />
                  </th>
                  <th
                    className="px-3 py-3 text-right cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('variance')}
                  >
                    Variance <SortIcon field="variance" />
                  </th>
                  <th
                    className="px-3 py-3 text-center cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('derived_status')}
                  >
                    Status <SortIcon field="derived_status" />
                  </th>
                  <th
                    className="px-3 py-3 text-right cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort('total_value')}
                  >
                    Value <SortIcon field="total_value" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((m) => (
                  <tr
                    key={`${m.material_number}|${m.sloc}`}
                    className={`${STATUS_ROW_BG[m.derived_status] ?? 'bg-white'} hover:brightness-95 transition-all`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-medium text-gray-800">{m.material_number}</div>
                      {m.description && (
                        <div className="text-xs text-gray-400 truncate max-w-[14rem]">{m.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-600 text-sm">{m.sloc}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                      {formatNumber(m.sap_quantity)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">
                      {m.derived_status === 'not_counted' ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        formatNumber(m.counted_qty)
                      )}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                      m.derived_status === 'not_counted'
                        ? 'text-gray-300'
                        : m.variance > 0
                        ? 'text-green-700'
                        : m.variance < 0
                        ? 'text-red-700'
                        : 'text-gray-500'
                    }`}>
                      {m.derived_status === 'not_counted' ? (
                        '—'
                      ) : (
                        (m.variance >= 0 ? '+' : '') + formatNumber(m.variance)
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={m.derived_status} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500">
                      {m.total_value != null ? formatCurrency(m.total_value) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalCount > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Showing {materials.length.toLocaleString()} of {totalCount.toLocaleString()} materials
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Variance Tab ─────────────────────────────────────────────────────────────

function VarianceTab({ variance }: { variance: VarianceRow[] }) {
  const totalSap = variance.reduce((s, v) => s + v.sap_total, 0);
  const totalCounted = variance.reduce((s, v) => s + v.counted_total, 0);
  const netVariance = totalCounted - totalSap;

  if (variance.length === 0) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <EmptyState message="No variance data yet. Load a snapshot and complete some counts to see discrepancies here." />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Summary header */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-gray-800">{formatNumber(totalSap, 0)}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Total SAP Qty</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-gray-800">{formatNumber(totalCounted, 0)}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Total Counted Qty</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className={`text-2xl font-bold ${netVariance > 0 ? 'text-green-700' : netVariance < 0 ? 'text-red-700' : 'text-gray-500'}`}>
              {(netVariance >= 0 ? '+' : '') + formatNumber(netVariance, 0)}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Net Variance</div>
          </CardBody>
        </Card>
      </div>

      {/* Per-SLOC table */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-800 text-sm">Variance by SLOC</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">SLOC</th>
                <th className="px-4 py-3 text-right">SAP Total</th>
                <th className="px-4 py-3 text-right">Counted Total</th>
                <th className="px-4 py-3 text-right">Net Variance</th>
                <th className="px-4 py-3 text-left w-40">Variance Bar</th>
                <th className="px-4 py-3 text-right">Materials Counted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {variance.map((v) => {
                const net = v.counted_total - v.sap_total;
                const pct = v.material_count > 0
                  ? Math.round((v.counted_materials / v.material_count) * 100)
                  : 0;
                const absMax = Math.max(Math.abs(v.sap_total), Math.abs(v.counted_total), 1);
                const barPct = Math.min(100, (Math.abs(net) / absMax) * 100);

                return (
                  <tr key={v.sloc} className={Math.abs(net) > 0 ? 'bg-orange-50' : ''}>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{v.sloc}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatNumber(v.sap_total, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatNumber(v.counted_total, 0)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${
                      net > 0 ? 'text-green-700' : net < 0 ? 'text-red-700' : 'text-gray-500'
                    }`}>
                      {(net >= 0 ? '+' : '') + formatNumber(net, 0)}
                    </td>
                    <td className="px-4 py-3">
                      {Math.abs(net) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${net > 0 ? 'bg-green-400' : 'bg-red-400'}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">No variance</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-700">{v.counted_materials}/{v.material_count}</span>
                      <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Problem Materials Tab ────────────────────────────────────────────────────

function getProblemPriority(p: ProblemMaterial): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (p.adj_count >= 5) return 'HIGH';
  if (p.adj_count >= 2) return 'MEDIUM';
  return 'LOW';
}

const PROBLEM_ROW_BG: Record<string, string> = {
  HIGH:   'bg-red-50',
  MEDIUM: 'bg-orange-50',
  LOW:    'bg-yellow-50',
};

const PROBLEM_BADGE: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-orange-100 text-orange-700',
  LOW:    'bg-yellow-100 text-yellow-700',
};

function ProblemsTab({ problems }: { problems: ProblemMaterial[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="bg-amber-50 border-l-4 border-amber-400 rounded-lg py-3">
          <p className="text-sm text-amber-800 font-medium">MSEG Movement History</p>
          <p className="text-xs text-amber-700 mt-0.5">
            These materials have unusual movement patterns in SAP (adjustments, transfers, issues).
            High-priority items ({'>'}=5 adjustments) should be re-verified before closing the count.
          </p>
        </CardBody>
      </Card>

      <Card>
        {problems.length === 0 ? (
          <CardBody className="py-12 text-center">
            <EmptyState
              message="No problem materials found. Either the MSEG data hasn't been loaded, or there are no materials with unusual movement patterns."
              icon="✓"
              iconColor="text-green-400"
            />
          </CardBody>
        ) : (
          <>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 text-sm">Problem Materials</h2>
                <span className="text-xs text-gray-400">{problems.length} materials flagged</span>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Priority</th>
                    <th className="px-4 py-3 text-left">Material</th>
                    <th className="px-4 py-3 text-right">Total Movements</th>
                    <th className="px-4 py-3 text-right">Adjustments</th>
                    <th className="px-4 py-3 text-right">Transfers</th>
                    <th className="px-4 py-3 text-right">Issues</th>
                    <th className="px-4 py-3 text-left">Last Movement</th>
                    <th className="px-4 py-3 text-left">Types</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {problems.map((p) => {
                    const priority = getProblemPriority(p);
                    return (
                      <tr
                        key={p.material_number}
                        className={`${PROBLEM_ROW_BG[priority]} hover:brightness-95 transition-all`}
                      >
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PROBLEM_BADGE[priority]}`}>
                            {priority}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-mono font-medium text-gray-800">{p.material_number}</div>
                          {p.description && (
                            <div className="text-xs text-gray-400 truncate max-w-[14rem]">{p.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                          {formatNumber(p.movement_count, 0)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${p.adj_count >= 5 ? 'text-red-700' : p.adj_count >= 2 ? 'text-orange-600' : 'text-gray-700'}`}>
                          {formatNumber(p.adj_count, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{formatNumber(p.transfer_count, 0)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{formatNumber(p.issue_count, 0)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {p.last_movement ? formatDateTime(p.last_movement) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-mono max-w-[10rem] truncate">
                          {p.movement_types || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  verify: 'bg-green-100 text-green-700',
  flag:   'bg-red-100 text-red-700',
  edit:   'bg-blue-100 text-blue-700',
  create: 'bg-gray-100 text-gray-600',
  reopen: 'bg-yellow-100 text-yellow-700',
};

function AuditLog({ audit }: { audit: AuditEntry[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 25;

  const groups = React.useMemo(() => {
    const map = new Map<number, AuditEntry[]>();
    for (const a of audit) {
      const existing = map.get(a.count_id);
      if (existing) {
        existing.push(a);
      } else {
        map.set(a.count_id, [a]);
      }
    }
    return [...map.values()].sort((a, b) =>
      new Date(b[b.length - 1].created_at).getTime() - new Date(a[a.length - 1].created_at).getTime()
    );
  }, [audit]);

  const totalEdits = audit.length;
  const visible = showAll ? groups : groups.slice(0, VISIBLE);

  function toggle(countId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(countId) ? next.delete(countId) : next.add(countId);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Audit Log</h2>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{groups.length} counts</span>
            <span>·</span>
            <span>{totalEdits} total updates</span>
          </div>
        </div>
      </CardHeader>

      {groups.length === 0 ? (
        <CardBody className="py-12 text-center">
          <EmptyState message="No audit entries yet. Actions taken on counts will appear here." />
        </CardBody>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 w-6" />
                  <th className="px-3 py-3 text-left">Count #</th>
                  <th className="px-3 py-3 text-left">Material</th>
                  <th className="px-3 py-3 text-left">SLOC</th>
                  <th className="px-3 py-3 text-left">Last Event</th>
                  <th className="px-3 py-3 text-left">Last Editor</th>
                  <th className="px-3 py-3 text-center">Updates</th>
                  <th className="px-3 py-3 text-left">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((entries) => {
                  const last = entries[entries.length - 1];
                  const isOpen = expanded.has(last.count_id);
                  return (
                    <React.Fragment key={last.count_id}>
                      {/* Summary row */}
                      <tr
                        className="hover:bg-gray-50 cursor-pointer select-none transition-colors"
                        onClick={() => toggle(last.count_id)}
                      >
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{isOpen ? '▾' : '▸'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">#{last.count_id}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-800 text-xs">{last.material_number}</td>
                        <td className="px-3 py-2.5 text-gray-600 text-xs">{last.sloc}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_COLORS[last.event_type] ?? 'bg-gray-100 text-gray-600'}`}>
                            {last.event_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 text-xs">{last.editor_username}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                            {entries.length}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                          {formatDateTime(last.created_at)}
                        </td>
                      </tr>

                      {/* Expanded detail rows */}
                      {isOpen && entries.map((a) => (
                        <tr key={a.id} className="bg-blue-50 border-l-2 border-blue-300">
                          <td />
                          <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap" colSpan={2}>
                            {formatDateTime(a.created_at)}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{a.editor_username}</td>
                          <td className="px-3 py-1.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_COLORS[a.event_type] ?? 'bg-gray-100 text-gray-600'}`}>
                              {a.event_type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-500">{a.field_name ?? '—'}</td>
                          <td className="px-3 py-1.5 text-xs">
                            {a.old_value && (
                              <span className="line-through text-red-500 mr-1">{a.old_value}</span>
                            )}
                            {a.new_value && (
                              <span className="text-green-700 font-medium">{a.new_value}</span>
                            )}
                            {!a.old_value && !a.new_value && '—'}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-500 max-w-[12rem] truncate">
                            {a.reason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {groups.length > VISIBLE && (
            <div className="px-4 py-2.5 border-t border-gray-100 text-center">
              <button
                className="no-min-h text-xs text-blue-600 hover:underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show fewer' : `Show all ${groups.length} counts`}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Shared Visual Components ─────────────────────────────────────────────────

interface DonutChartProps {
  pending: number;
  verified: number;
  flagged: number;
  total: number;
}

function DonutChart({ pending, verified, flagged, total }: DonutChartProps) {
  const r = 52;
  const C = 2 * Math.PI * r; // circumference ≈ 326.7

  const segments: { value: number; color: string; label: string }[] = [
    { value: pending,  color: '#60a5fa', label: 'Counted'  }, // blue-400
    { value: verified, color: '#22c55e', label: 'Verified' }, // green-500
    { value: flagged,  color: '#f87171', label: 'Flagged'  }, // red-400
  ];

  if (total === 0) {
    return (
      <svg viewBox="0 0 120 120" width={120} height={120} className="overflow-visible">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#e5e7eb" strokeWidth={16} />
        <text x={60} y={64} textAnchor="middle" className="text-base" fontSize={14} fontWeight="bold" fill="#9ca3af">
          0
        </text>
      </svg>
    );
  }

  let startPct = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const pct = s.value / total;
      const arc = {
        color: s.color,
        dasharray: `${pct * C} ${C}`,
        dashoffset: C * (1 - startPct),
      };
      startPct += pct;
      return arc;
    });

  return (
    <svg viewBox="0 0 120 120" width={140} height={140} className="overflow-visible drop-shadow-sm">
      {/* Background ring */}
      <circle
        cx={60} cy={60} r={r}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={16}
      />
      {/* Segments */}
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={60} cy={60} r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={16}
          strokeDasharray={arc.dasharray}
          strokeDashoffset={arc.dashoffset}
          strokeLinecap="butt"
          transform="rotate(-90 60 60)"
        />
      ))}
      {/* Center label */}
      <text x={60} y={55} textAnchor="middle" fontSize={20} fontWeight="bold" fill="#111827">
        {formatNumber(total, 0)}
      </text>
      <text x={60} y={70} textAnchor="middle" fontSize={9} fill="#9ca3af">
        total counts
      </text>
    </svg>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
      <span>{label}</span>
      <span className="font-semibold text-gray-800">{formatNumber(value, 0)}</span>
    </span>
  );
}

function CountTrendChart({ trend }: { trend: CountTrend[] }) {
  const max = Math.max(...trend.map((t) => t.count), 1);

  return (
    <div className="flex items-end gap-1 h-32 w-full pt-4">
      {trend.map((t, i) => {
        const pct = (t.count / max) * 100;
        const label = t.hour.length >= 16 ? t.hour.slice(11, 16) : t.hour;
        const isLast = i === trend.length - 1;
        // Show label every 4th bar or on last to avoid crowding
        const showLabel = i % 4 === 0 || isLast;

        return (
          <div key={t.hour} className="flex-1 flex flex-col items-center gap-0.5 min-w-0 group">
            {t.count > 0 && (
              <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity leading-none">
                {t.count}
              </span>
            )}
            <div className="w-full flex items-end" style={{ height: 100 }}>
              <div
                className="w-full bg-blue-400 hover:bg-blue-500 rounded-t transition-all cursor-default"
                style={{ height: `${Math.max(pct, t.count > 0 ? 2 : 0)}%`, minHeight: t.count > 0 ? 2 : 0 }}
                title={`${label}: ${t.count} count${t.count !== 1 ? 's' : ''}`}
              />
            </div>
            <span className={`text-[9px] text-gray-400 truncate w-full text-center leading-none ${showLabel ? '' : 'invisible'}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({
  message,
  icon = '○',
  iconColor = 'text-gray-300',
}: {
  message: string;
  icon?: string;
  iconColor?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <span className={`text-3xl ${iconColor}`}>{icon}</span>
      <p className="text-sm text-gray-400 max-w-sm text-center">{message}</p>
    </div>
  );
}

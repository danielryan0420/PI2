import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import { getSocket, joinSession } from '../lib/socket';
import { formatDateTime, formatCurrency, formatNumber } from '../lib/utils';
import type { DashboardStats, MaterialStatus, VarianceRow, AuditEntry, HighValueItem, SlocBreakdown, CounterActivity, CountTrend } from '../types';

export function DashboardPage() {
  const { role, username, session } = useSession();
  const headers = { role: role ?? '', username };

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [materialStatus, setMaterialStatus] = useState<MaterialStatus[]>([]);
  const [variance, setVariance] = useState<VarianceRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [highValue, setHighValue] = useState<HighValueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [matFilter, setMatFilter] = useState('');

  const loadAll = useCallback(async () => {
    if (!session) return;
    try {
      const [s, ms, v] = await Promise.all([
        api.get<DashboardStats>(`/sessions/${session.id}/dashboard/summary`, headers),
        api.get<MaterialStatus[]>(`/sessions/${session.id}/dashboard/materials`, headers),
        api.get<VarianceRow[]>(`/sessions/${session.id}/dashboard/discrepancies`, headers),
      ]);
      setStats(s);
      setMaterialStatus(ms);
      setVariance(v);
      setHighValue([]); // Not implemented yet
    } catch (e) { console.log('Dashboard load error:', e); }
    finally { setLoading(false); }
  }, [session?.id]);

  const loadAudit = useCallback(async () => {
    if (!session) return;
    try {
      const data = await api.get<AuditEntry[]>(
        `/sessions/${session.id}/audit`, headers
      );
      setAudit(data);
      setAuditTotal(data.length);
    } catch (e) { console.log('Audit load error:', e); }
  }, [session?.id, auditPage]);

  useEffect(() => { loadAll(); loadAudit(); }, [loadAll, loadAudit]);

  // Real-time dashboard updates
  useEffect(() => {
    if (!session) return;
    joinSession(session.id);
    const socket = getSocket();
    socket.on('dashboard:updated', (newStats: DashboardStats) => setStats(newStats));
    socket.on('count:created', loadAll);
    socket.on('count:updated', loadAll);
    socket.on('count:verified', loadAll);
    socket.on('count:flagged', loadAll);
    socket.on('snapshot:loaded', loadAll);
    return () => {
      socket.off('dashboard:updated');
      socket.off('count:created', loadAll);
      socket.off('count:updated', loadAll);
      socket.off('count:verified', loadAll);
      socket.off('count:flagged', loadAll);
      socket.off('snapshot:loaded', loadAll);
    };
  }, [session?.id, loadAll]);

  const filteredMaterials = matFilter
    ? materialStatus.filter((m) =>
        m.material_number.includes(matFilter.toUpperCase()) ||
        (m.description ?? '').toLowerCase().includes(matFilter.toLowerCase()) ||
        m.sloc.includes(matFilter.toUpperCase())
      )
    : materialStatus;

  const statusRowColor: Record<string, string> = {
    not_counted: 'bg-white',
    pending: 'bg-blue-50',
    verified: 'bg-green-50',
    flagged: 'bg-red-50',
    variance: 'bg-orange-50',
  };

  if (!session) return (
    <AppShell>
      <div className="flex items-center justify-center h-64 text-gray-400">Select a session first</div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Dashboard — {session.name}</h1>
          <button onClick={() => { loadAll(); loadAudit(); }} className="no-min-h text-xs text-blue-600 hover:underline">↻ Refresh</button>
        </div>

        {/* ─── Top stat widgets ─── */}
        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardBody className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{stats.totals.total}</div>
                  <div className="text-xs text-gray-500 mt-1">Total Counts</div>
                  {stats.totals.total > 0 && (
                    <div className="mt-2 flex h-2 rounded-full overflow-hidden gap-px">
                      {stats.totals.pending > 0 && <div className="bg-blue-400" style={{ width: `${(stats.totals.pending / stats.totals.total) * 100}%` }} title={`${stats.totals.pending} pending`} />}
                      {stats.totals.verified > 0 && <div className="bg-green-500" style={{ width: `${(stats.totals.verified / stats.totals.total) * 100}%` }} title={`${stats.totals.verified} verified`} />}
                      {stats.totals.flagged > 0 && <div className="bg-red-400" style={{ width: `${(stats.totals.flagged / stats.totals.total) * 100}%` }} title={`${stats.totals.flagged} flagged`} />}
                    </div>
                  )}
                  <div className="flex justify-center gap-2 mt-1.5 text-xs">
                    <span className="text-blue-600">{stats.totals.pending}P</span>
                    <span className="text-green-600">{stats.totals.verified}V</span>
                    <span className="text-red-600">{stats.totals.flagged}F</span>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="text-center">
                  <div className="text-3xl font-bold text-green-700">
                    {stats.first_pass_yield !== null ? `${stats.first_pass_yield}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">First Pass Yield</div>
                  {stats.first_pass_yield !== null && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${stats.first_pass_yield}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">{stats.first_pass_count} / {stats.totals.verified} first try</div>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="text-center">
                  <div className="text-3xl font-bold text-blue-700">
                    {stats.snapshot_loaded ? `${stats.snapshot_counted}/${stats.snapshot_total}` : '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Progress vs Snapshot</div>
                  {stats.snapshot_loaded && stats.snapshot_total > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (stats.snapshot_counted / stats.snapshot_total) * 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{Math.round((stats.snapshot_counted / stats.snapshot_total) * 100)}%</div>
                    </div>
                  )}
                  {!stats.snapshot_loaded && <div className="text-xs text-amber-500 mt-2">Load snapshot in SAP Data tab</div>}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="text-center">
                  <div className="text-3xl font-bold text-amber-600">{stats.unread_messages}</div>
                  <div className="text-xs text-gray-500 mt-1">Unanswered Questions</div>
                  {stats.unread_messages > 0 && (
                    <div className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg py-1">Needs office reply</div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* ─── SLOC Breakdown + Counter Activity ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SLOC Breakdown */}
              {stats.sloc_breakdown.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-gray-800 text-sm">Counts by SLOC</h2></CardHeader>
                  <CardBody className="flex flex-col gap-2">
                    {stats.sloc_breakdown.map((s: SlocBreakdown) => (
                      <div key={s.sloc}>
                        <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                          <span className="font-mono font-medium">{s.sloc}</span>
                          <span>{s.total} counts</span>
                        </div>
                        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 gap-px">
                          {s.pending > 0 && (
                            <div className="bg-blue-400 transition-all" style={{ width: `${(s.pending / s.total) * 100}%` }} title={`${s.pending} pending`} />
                          )}
                          {s.verified > 0 && (
                            <div className="bg-green-500 transition-all" style={{ width: `${(s.verified / s.total) * 100}%` }} title={`${s.verified} verified`} />
                          )}
                          {s.flagged > 0 && (
                            <div className="bg-red-400 transition-all" style={{ width: `${(s.flagged / s.total) * 100}%` }} title={`${s.flagged} flagged`} />
                          )}
                        </div>
                        <div className="flex gap-3 text-[10px] text-gray-400 mt-0.5">
                          {s.pending > 0 && <span className="text-blue-500">{s.pending} pending</span>}
                          {s.verified > 0 && <span className="text-green-600">{s.verified} verified</span>}
                          {s.flagged > 0 && <span className="text-red-500">{s.flagged} flagged</span>}
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )}

              {/* Counter Activity */}
              {stats.counter_activity.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-gray-800 text-sm">Counter Activity</h2></CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Counter</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-center">Status</th>
                          <th className="px-3 py-2 text-right hidden sm:table-cell">Last Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.counter_activity.map((ca: CounterActivity) => (
                          <tr key={ca.username} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800">{ca.username}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{ca.total}</td>
                            <td className="px-3 py-2">
                              <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 gap-px min-w-[60px]">
                                {ca.pending > 0 && <div className="bg-blue-400" style={{ width: `${(ca.pending / ca.total) * 100}%` }} />}
                                {ca.verified > 0 && <div className="bg-green-500" style={{ width: `${(ca.verified / ca.total) * 100}%` }} />}
                                {ca.flagged > 0 && <div className="bg-red-400" style={{ width: `${(ca.flagged / ca.total) * 100}%` }} />}
                              </div>
                              <div className="flex gap-2 text-[10px] mt-0.5">
                                <span className="text-blue-500">{ca.pending}P</span>
                                <span className="text-green-600">{ca.verified}V</span>
                                <span className="text-red-500">{ca.flagged}F</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-400 hidden sm:table-cell">{formatDateTime(ca.last_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>

            {/* ─── Count Trend (last 24h) ─── */}
            {stats.count_trend.length > 1 && (
              <Card>
                <CardHeader><h2 className="font-semibold text-gray-800 text-sm">Count Activity — Last 24 Hours</h2></CardHeader>
                <CardBody>
                  <CountTrendChart trend={stats.count_trend} />
                </CardBody>
              </Card>
            )}
          </>
        )}

        {/* ─── Material Status Tracker ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-800">Material Status vs Snapshot</h2>
              <input
                placeholder="Filter material / SLOC…"
                value={matFilter}
                onChange={(e) => setMatFilter(e.target.value)}
                className="no-min-h min-h-[36px] px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
              />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            {materialStatus.length === 0 && !loading ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                {stats?.snapshot_loaded ? 'No materials in snapshot' : 'Load a snapshot in the SAP Data tab to enable this view'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left">Material</th>
                    <th className="px-3 py-3 text-left">SLOC</th>
                    <th className="px-3 py-3 text-right">SAP Qty</th>
                    <th className="px-3 py-3 text-right">Counted</th>
                    <th className="px-3 py-3 text-right">Variance</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMaterials.map((m) => (
                    <tr key={`${m.material_number}|${m.sloc}`} className={statusRowColor[m.derived_status] ?? 'bg-white'}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-gray-800">{m.material_number}</div>
                        {m.description && <div className="text-xs text-gray-400 truncate max-w-[14rem]">{m.description}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{m.sloc}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">{formatNumber(m.sap_quantity)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800">
                        {m.derived_status === 'not_counted' ? '—' : formatNumber(m.counted_qty)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${m.variance > 0 ? 'text-green-700' : m.variance < 0 ? 'text-red-700' : 'text-gray-500'}`}>
                        {m.derived_status === 'not_counted' ? '—' : (m.variance >= 0 ? '+' : '') + formatNumber(m.variance)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={m.derived_status} />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500">
                        {m.total_value != null ? formatCurrency(m.total_value) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* ─── Variance by SLOC ─── */}
        {variance.length > 0 && (
          <Card>
            <CardHeader><h2 className="font-semibold text-gray-800">Variance by SLOC</h2></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-3 text-left">SLOC</th>
                    <th className="px-3 py-3 text-right">SAP Total</th>
                    <th className="px-3 py-3 text-right">Counted Total</th>
                    <th className="px-3 py-3 text-right">Net Variance</th>
                    <th className="px-3 py-3 text-right">Materials Counted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {variance.map((v) => {
                    const net = v.counted_total - v.sap_total;
                    return (
                      <tr key={v.sloc} className={Math.abs(net) > 0 ? 'bg-orange-50' : ''}>
                        <td className="px-3 py-2 font-semibold text-gray-800">{v.sloc}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{formatNumber(v.sap_total)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{formatNumber(v.counted_total)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${net > 0 ? 'text-green-700' : net < 0 ? 'text-red-700' : 'text-gray-500'}`}>
                          {(net >= 0 ? '+' : '') + formatNumber(net)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{v.counted_materials}/{v.material_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ─── High-value materials ─── */}
        {highValue.length > 0 && (
          <Card>
            <CardHeader><h2 className="font-semibold text-gray-800">High-Value Materials — Prioritize Verification</h2></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-3 text-left">Material</th>
                    <th className="px-3 py-3 text-right">Total Value</th>
                    <th className="px-3 py-3 text-center">Submissions</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {highValue.map((hv) => (
                    <tr key={hv.material_number}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-gray-800">{hv.material_number}</div>
                        {hv.description && <div className="text-xs text-gray-400">{hv.description}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">
                        {hv.total_value != null ? formatCurrency(hv.total_value) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{hv.submission_count}</td>
                      <td className="px-3 py-2 text-center">
                        {hv.latest_status ? <StatusBadge status={hv.latest_status} /> : <StatusBadge status="not_counted" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ─── Audit log ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Audit Log</h2>
              <span className="text-xs text-gray-400">{auditTotal} entries</span>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-3 text-left">Time</th>
                  <th className="px-3 py-3 text-left">Count</th>
                  <th className="px-3 py-3 text-left">Editor</th>
                  <th className="px-3 py-3 text-left">Event</th>
                  <th className="px-3 py-3 text-left">Field</th>
                  <th className="px-3 py-3 text-left">Old → New</th>
                  <th className="px-3 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {audit.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">#{a.count_id}</td>
                    <td className="px-3 py-2 text-gray-700">{a.editor_username}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.event_type === 'verify' ? 'bg-green-100 text-green-700' : a.event_type === 'flag' ? 'bg-red-100 text-red-700' : a.event_type === 'edit' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{a.event_type}</span></td>
                    <td className="px-3 py-2 text-xs text-gray-500">{a.field_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.old_value && <span className="line-through text-red-500 mr-1">{a.old_value}</span>}
                      {a.new_value && <span className="text-green-700 font-medium">{a.new_value}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[12rem] truncate">{a.reason ?? '—'}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No audit entries</td></tr>}
              </tbody>
            </table>
          </div>
          {auditTotal > 25 && (
            <div className="px-3 py-2 border-t border-gray-100 flex gap-2 justify-center">
              <button className="no-min-h text-xs text-blue-600 disabled:opacity-40 px-3 py-1" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>← Prev</button>
              <span className="text-xs text-gray-500 self-center">Page {auditPage}</span>
              <button className="no-min-h text-xs text-blue-600 disabled:opacity-40 px-3 py-1" disabled={auditPage * 25 >= auditTotal} onClick={() => setAuditPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function CountTrendChart({ trend }: { trend: CountTrend[] }) {
  const max = Math.max(...trend.map((t) => t.count), 1);
  return (
    <div className="flex items-end gap-1 h-24 w-full">
      {trend.map((t) => {
        const pct = (t.count / max) * 100;
        const label = t.hour.slice(11, 16); // HH:MM
        return (
          <div key={t.hour} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] text-gray-500">{t.count}</span>
            <div className="w-full flex items-end" style={{ height: 60 }}>
              <div
                className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                style={{ height: `${pct}%`, minHeight: 2 }}
                title={`${t.hour}: ${t.count} counts`}
              />
            </div>
            <span className="text-[9px] text-gray-400 truncate w-full text-center">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

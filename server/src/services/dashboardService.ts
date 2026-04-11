import db from '../db';

export function computeDashboard(session_id: number) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged
    FROM counts WHERE session_id = ?
  `).get(session_id) as { total: number; pending: number; verified: number; flagged: number };

  // First pass yield: verified counts that were NEVER flagged
  const firstPass = db.prepare(`
    SELECT COUNT(*) as count FROM counts c
    WHERE c.session_id = ? AND c.status = 'verified'
    AND NOT EXISTS (
      SELECT 1 FROM audit_log a WHERE a.count_id = c.id AND a.event_type = 'flag'
    )
  `).get(session_id) as { count: number };

  const fpy = totals.verified > 0 ? Math.round((firstPass.count / totals.verified) * 100) : null;

  // Snapshot summary
  const snapshotLoaded = db.prepare(
    'SELECT COUNT(*) as c FROM sap_snapshot WHERE session_id = ?'
  ).get(session_id) as { c: number };

  let snapshotTotal = 0;
  let snapshotCounted = 0;
  if (snapshotLoaded.c > 0) {
    const snap = db.prepare(`
      SELECT COUNT(DISTINCT s.material_number || '|' || s.sloc) as total,
             COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN s.material_number || '|' || s.sloc END) as counted
      FROM sap_snapshot s
      LEFT JOIN counts c ON c.material_number = s.material_number
        AND c.sloc = s.sloc AND c.session_id = s.session_id
        AND c.status != 'flagged'
      WHERE s.session_id = ?
    `).get(session_id) as { total: number; counted: number };
    snapshotTotal = snap.total;
    snapshotCounted = snap.counted;
  }

  // Unread messages (questions with no reply — both general and count-linked)
  const unreadMessages = db.prepare(`
    SELECT COUNT(*) as c FROM (
      SELECT COALESCE(count_id, 0) as thread_key, MIN(session_id) as sid
      FROM messages
      WHERE session_id = ? AND role = 'counter'
      GROUP BY thread_key
      HAVING thread_key NOT IN (
        SELECT DISTINCT COALESCE(count_id, 0)
        FROM messages
        WHERE session_id = ? AND role = 'office'
      )
    )
  `).get(session_id, session_id) as { c: number };

  // SLOC breakdown
  const slocBreakdown = db.prepare(`
    SELECT sloc,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged
    FROM counts
    WHERE session_id = ?
    GROUP BY sloc
    ORDER BY total DESC
  `).all(session_id) as { sloc: string; total: number; pending: number; verified: number; flagged: number }[];

  // Counter activity
  const counterActivity = db.prepare(`
    SELECT username,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged,
      MIN(created_at) as first_count,
      MAX(created_at) as last_count
    FROM counts
    WHERE session_id = ?
    GROUP BY username
    ORDER BY total DESC
  `).all(session_id) as { username: string; total: number; pending: number; verified: number; flagged: number; first_count: string; last_count: string }[];

  // Count trend — counts per hour bucket (last 24 hours)
  const countTrend = db.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:00', created_at) as hour,
      COUNT(*) as count
    FROM counts
    WHERE session_id = ?
      AND created_at >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour ASC
  `).all(session_id) as { hour: string; count: number }[];

  return {
    session_id,
    totals,
    first_pass_yield: fpy,
    first_pass_count: firstPass.count,
    snapshot_loaded: snapshotLoaded.c > 0,
    snapshot_total: snapshotTotal,
    snapshot_counted: snapshotCounted,
    unread_messages: unreadMessages.c,
    sloc_breakdown: slocBreakdown,
    counter_activity: counterActivity,
    count_trend: countTrend,
  };
}

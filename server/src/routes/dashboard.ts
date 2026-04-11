import { Router } from 'express';
import db from '../db';
import { computeDashboard } from '../services/dashboardService';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

// Aggregated dashboard stats
router.get('/sessions/:sessionId/dashboard', requireRole('office', 'admin'), (req, res) => {
  res.json(computeDashboard(Number(req.params.sessionId)));
});

// Per-material status vs snapshot (MaterialStatusTracker)
router.get('/sessions/:sessionId/material-status', requireRole('office', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT
      s.material_number,
      sm.description,
      s.sloc,
      sv.total_value,
      s.sap_quantity,
      COALESCE(SUM(CASE WHEN c.status != 'flagged' THEN c.quantity ELSE 0 END), 0) as counted_qty,
      MAX(c.status) as count_status,
      COUNT(c.id) as submission_count
    FROM sap_snapshot s
    LEFT JOIN sap_materials sm ON s.material_number = sm.material_number
    LEFT JOIN sap_valuation sv ON s.material_number = sv.material_number
    LEFT JOIN counts c ON c.material_number = s.material_number
      AND c.sloc = s.sloc AND c.session_id = s.session_id
    WHERE s.session_id = ?
    GROUP BY s.material_number, s.sloc
    ORDER BY COALESCE(sv.total_value, 0) DESC
  `).all(req.params.sessionId);

  // Compute derived status
  const result = (rows as Record<string, unknown>[]).map((row) => {
    const sap = row.sap_quantity as number;
    const counted = row.counted_qty as number;
    const variance = counted - sap;
    let derived_status = 'not_counted';
    if (row.count_status === 'verified') {
      derived_status = Math.abs(variance) < 0.001 ? 'verified' : 'variance';
    } else if (row.count_status === 'flagged') {
      derived_status = 'flagged';
    } else if (row.count_status === 'pending') {
      derived_status = 'pending';
    }
    return { ...row, variance, derived_status };
  });

  res.json(result);
});

// Snapshot vs counts SLOC roll-up
router.get('/sessions/:sessionId/variance', requireRole('office', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT
      s.sloc,
      SUM(s.sap_quantity) as sap_total,
      COALESCE(SUM(CASE WHEN c.status != 'flagged' THEN c.quantity ELSE 0 END), 0) as counted_total,
      COUNT(DISTINCT s.material_number) as material_count,
      COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN s.material_number END) as counted_materials
    FROM sap_snapshot s
    LEFT JOIN counts c ON c.material_number = s.material_number
      AND c.sloc = s.sloc AND c.session_id = s.session_id
    WHERE s.session_id = ?
    GROUP BY s.sloc
    ORDER BY ABS(COALESCE(SUM(CASE WHEN c.status != 'flagged' THEN c.quantity ELSE 0 END), 0) - SUM(s.sap_quantity)) DESC
  `).all(req.params.sessionId);

  res.json(rows);
});

// Audit log (paginated)
router.get('/sessions/:sessionId/audit', requireRole('office', 'admin'), (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const offset = (page - 1) * limit;

  const rows = db.prepare(`
    SELECT a.*, c.material_number, c.sloc
    FROM audit_log a
    JOIN counts c ON a.count_id = c.id
    WHERE c.session_id = ?
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.sessionId, limit, offset);

  const total = (db.prepare(`
    SELECT COUNT(*) as c FROM audit_log a
    JOIN counts c ON a.count_id = c.id
    WHERE c.session_id = ?
  `).get(req.params.sessionId) as { c: number }).c;

  res.json({ rows, total, page, limit });
});

// High-value materials
router.get('/sessions/:sessionId/high-value', requireRole('office', 'admin'), (req, res) => {
  const topN = Number(req.query.top ?? 50);
  const rows = db.prepare(`
    SELECT sv.material_number, sm.description, sv.total_value,
           COUNT(c.id) as submission_count,
           MAX(c.status) as latest_status
    FROM sap_valuation sv
    LEFT JOIN sap_materials sm ON sv.material_number = sm.material_number
    LEFT JOIN counts c ON c.material_number = sv.material_number AND c.session_id = ?
    GROUP BY sv.material_number
    ORDER BY COALESCE(sv.total_value, 0) DESC
    LIMIT ?
  `).all(req.params.sessionId, topN);
  res.json(rows);
});

export default router;

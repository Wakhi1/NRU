// Reports & export — CSV only in this build (PDF/XLSX letterhead rendering is out of scope for
// now, see the build's scoping notes). Head of Department gets department-scoped rows automatically
// via the same data-scope pattern as staff.routes.js.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { hasPermission } = require('../platform/scope');

const router = express.Router();
router.use(requireAuth, requirePermission('report.export'));

async function scopeClause(req) {
  if (hasPermission(req.session.user.roleKeys, 'staff.view.org') || hasPermission(req.session.user.roleKeys, 'aggregate.view')) {
    return { clause: '1=1', params: [] };
  }
  const me = await db.query('SELECT department FROM employee_cache WHERE employee_no = ?', [req.session.user.employeeNo]);
  return { clause: 'e.department = ?', params: [me[0]?.department || '__none__'] };
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => columns.map((c) => esc(r[c])).join(','));
  return [header, ...lines].join('\n');
}

router.get('/checkins', asyncHandler(async (req, res) => {
  const { clause, params } = await scopeClause(req);
  const rows = await db.query(
    `SELECT ci.id, e.employee_no, e.full_legal_name, e.department, ci.decision, ci.distance_m,
            z.name AS zone_name, ci.shift_started_at, ci.shift_ended_at, ci.status
     FROM check_in ci JOIN employee_cache e ON e.employee_no = ci.employee_no LEFT JOIN zone z ON z.id = ci.zone_id
     WHERE ${clause} ORDER BY ci.shift_started_at DESC LIMIT 500`,
    params
  );
  if (req.query.format === 'csv') {
    const csv = toCsv(rows, ['employee_no', 'full_legal_name', 'department', 'decision', 'distance_m', 'zone_name', 'shift_started_at', 'shift_ended_at', 'status']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="spts-checkins.csv"');
    return res.send(csv);
  }
  res.json({ data: rows });
}));

router.get('/alerts', asyncHandler(async (req, res) => {
  const { clause, params } = await scopeClause(req);
  const rows = await db.query(
    `SELECT a.id, a.severity, e.employee_no, e.full_legal_name, e.department, z.name AS zone_name, a.kind, a.note, a.resolved, a.created_at
     FROM alert a LEFT JOIN employee_cache e ON e.employee_no = a.employee_no LEFT JOIN zone z ON z.id = a.zone_id
     WHERE ${clause.replace('e.department', 'e.department')} ORDER BY a.created_at DESC LIMIT 500`,
    params
  );
  if (req.query.format === 'csv') {
    const csv = toCsv(rows, ['employee_no', 'full_legal_name', 'department', 'severity', 'zone_name', 'kind', 'note', 'resolved', 'created_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="spts-alerts.csv"');
    return res.send(csv);
  }
  res.json({ data: rows });
}));

module.exports = router;

// Audit trail viewer — read-only, admin-only (HR administrator / System administrator), over the
// audit_event table that every mutating route in the app already writes to via platform/audit.js.
// Not gated through the permission matrix (like Settings and VoIP provisioning) since the audit
// log itself carries before/after JSON for every module, so a per-module "reports" style scope
// wouldn't map cleanly — only admins get to browse it, full stop.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, unauthorized, forbidden, notFound } = require('../platform/errors');
const rk = require('../platform/reportKit');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) return next(unauthorized());
  if (!['HR administrator', 'System administrator'].includes(req.session.user.role)) {
    return next(forbidden('Audit trail is restricted to HR and System administrators'));
  }
  next();
}
router.use(requireAdmin);

const COLUMNS = [
  { key: 'at', label: 'Timestamp' }, { key: 'actor_name', label: 'Actor' }, { key: 'actor_employee_no', label: 'Employee no.' },
  { key: 'action', label: 'Action' }, { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'Entity ID' },
  { key: 'ip', label: 'IP' }, { key: 'consumer', label: 'Consumer' },
];

function buildFilters(q) {
  const where = ['1=1'];
  const params = [];
  if (q.dateFrom) { where.push('ae.at >= ?'); params.push(q.dateFrom); }
  if (q.dateTo) { where.push('ae.at <= ?'); params.push(`${q.dateTo} 23:59:59`); }
  if (q.actor) { where.push('ae.actor_employee_no = ?'); params.push(q.actor); }
  if (q.action) { where.push('ae.action = ?'); params.push(q.action); }
  if (q.entityType) { where.push('ae.entity_type = ?'); params.push(q.entityType); }
  if (q.entityId) { where.push('ae.entity_id = ?'); params.push(q.entityId); }
  if (q.consumer) { where.push('ae.consumer = ?'); params.push(q.consumer); }
  if (q.q) {
    where.push('(ae.entity_id LIKE ? OR ae.before_json LIKE ? OR ae.after_json LIKE ? OR p.full_legal_name LIKE ?)');
    const like = `%${q.q}%`;
    params.push(like, like, like, like);
  }
  return { clause: where.join(' AND '), params };
}

function filterLines(q) {
  const lines = [];
  if (q.dateFrom) lines.push(`From: ${q.dateFrom}`);
  if (q.dateTo) lines.push(`To: ${q.dateTo}`);
  if (q.actor) lines.push(`Actor: ${q.actor}`);
  if (q.action) lines.push(`Action: ${q.action}`);
  if (q.entityType) lines.push(`Entity: ${q.entityType}`);
  if (q.entityId) lines.push(`Entity ID: ${q.entityId}`);
  if (q.consumer) lines.push(`Consumer: ${q.consumer}`);
  if (q.q) lines.push(`Search: "${q.q}"`);
  return lines;
}

router.get('/facets', asyncHandler(async (req, res) => {
  const [actions, entityTypes, consumers, actors] = await Promise.all([
    db.query('SELECT DISTINCT action FROM audit_event ORDER BY action'),
    db.query('SELECT DISTINCT entity_type FROM audit_event ORDER BY entity_type'),
    db.query('SELECT DISTINCT consumer FROM audit_event ORDER BY consumer'),
    db.query(`SELECT DISTINCT ae.actor_employee_no AS value, COALESCE(p.full_legal_name, ae.actor_employee_no) AS label
               FROM audit_event ae LEFT JOIN person p ON p.employee_no = ae.actor_employee_no
               WHERE ae.actor_employee_no IS NOT NULL ORDER BY label`),
  ]);
  res.json({
    data: {
      actions: actions.map((r) => r.action),
      entityTypes: entityTypes.map((r) => r.entity_type),
      consumers: consumers.map((r) => r.consumer),
      actors,
    },
  });
}));

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize, 10) || 50));
  const { clause, params } = buildFilters(req.query);

  const [{ n: total }] = await db.query(
    `SELECT COUNT(*) AS n FROM audit_event ae LEFT JOIN person p ON p.employee_no = ae.actor_employee_no WHERE ${clause}`, params
  );
  const rows = await db.query(
    `SELECT ae.id, ae.at, ae.actor_employee_no, COALESCE(p.full_legal_name, 'System') AS actor_name, ae.action,
            ae.entity_type, ae.entity_id, ae.ip, ae.consumer
     FROM audit_event ae LEFT JOIN person p ON p.employee_no = ae.actor_employee_no
     WHERE ${clause} ORDER BY ae.at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  res.json({ data: rows, meta: { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT ae.*, COALESCE(p.full_legal_name, 'System') AS actor_name
     FROM audit_event ae LEFT JOIN person p ON p.employee_no = ae.actor_employee_no WHERE ae.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw notFound('Audit event not found');
  const row = rows[0];
  res.json({
    data: {
      ...row,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
    },
  });
}));

router.post('/export', asyncHandler(async (req, res) => {
  const format = (req.body.format || 'csv').toLowerCase();
  const q = req.body.filters || {};
  const { clause, params } = buildFilters(q);
  const rows = await db.query(
    `SELECT ae.at, COALESCE(p.full_legal_name, 'System') AS actor_name, ae.actor_employee_no, ae.action,
            ae.entity_type, ae.entity_id, ae.ip, ae.consumer, ae.before_json, ae.after_json
     FROM audit_event ae LEFT JOIN person p ON p.employee_no = ae.actor_employee_no
     WHERE ${clause} ORDER BY ae.at DESC LIMIT 50000`, params
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const org = await rk.getOrgInfo(db);

  if (format === 'csv') {
    const cols = [...COLUMNS, { key: 'before_json', label: 'Before' }, { key: 'after_json', label: 'After' }];
    return rk.sendCsv(res, cols, rows, `audit-trail-${stamp}.csv`);
  }
  const payload = {
    title: 'Audit trail', subtitle: 'Full system activity log',
    orgName: org.orgName, logoUrl: org.logoUrl,
    generatedBy: `${req.session.user.name} (${req.session.user.role})`,
    generatedAt: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    filterLines: filterLines(q),
    sections: [{ heading: 'Audit trail', columns: COLUMNS, rows }],
  };
  if (format === 'xlsx') return rk.buildXlsx(payload, res, `audit-trail-${stamp}.xlsx`);
  if (format === 'pdf') return rk.buildPdf(payload, res, `audit-trail-${stamp}.pdf`);
  throw badRequest('format must be csv, xlsx or pdf');
}));

module.exports = router;

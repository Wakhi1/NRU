const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');

const router = express.Router();

function toDate(mysqlDatetime) {
  return new Date(String(mysqlDatetime).replace(' ', 'T'));
}

function computeRow(row) {
  const hours = row.clock_out ? +(((toDate(row.clock_out) - toDate(row.clock_in)) / 3600000).toFixed(2)) : null;
  let status = 'Open';
  if (row.clock_out) {
    const grace = row.grace_minutes == null ? 10 : row.grace_minutes;
    const cutoff = 8 * 60 + grace;
    const clockInDate = toDate(row.clock_in);
    const minutesIn = clockInDate.getHours() * 60 + clockInDate.getMinutes();
    status = minutesIn > cutoff ? 'Late' : 'On time';
  }
  return { ...row, hours, status };
}

router.get('/timers', requireScope('attendance', 'read'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'wt.employee_no');
  let sql = `SELECT wt.*, p.full_legal_name, ou.name AS department_name, sp.name AS shift_name, sp.grace_minutes
             FROM work_timer wt
             JOIN person p ON p.employee_no = wt.employee_no
             LEFT JOIN employment e ON e.employee_no = wt.employee_no AND e.is_current = 1
             LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
             LEFT JOIN shift_pattern sp ON sp.id = wt.shift_pattern_id
             WHERE ${filter.clause}`;
  const params = [...filter.params];

  if (req.query.employee_no) { sql += ' AND wt.employee_no = ?'; params.push(req.query.employee_no); }
  if (req.query.from) { sql += ' AND DATE(wt.clock_in) >= ?'; params.push(req.query.from); }
  if (req.query.to) { sql += ' AND DATE(wt.clock_in) <= ?'; params.push(req.query.to); }
  sql += ' ORDER BY wt.clock_in DESC LIMIT 500';

  const rows = await db.query(sql, params);
  res.json({ data: rows.map(computeRow), meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/today', requireScope('attendance', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT * FROM work_timer WHERE employee_no = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
    [req.session.user.employeeNo]
  );
  res.json({ open: !!rows[0], timer: rows[0] || null });
}));

router.post('/clock-in', requireScope('attendance', 'create'), asyncHandler(async (req, res) => {
  const open = await db.query(
    `SELECT id FROM work_timer WHERE employee_no = ? AND clock_out IS NULL AND DATE(clock_in) = CURDATE()`,
    [req.session.user.employeeNo]
  );
  if (open[0]) throw conflict('Already clocked in — clock out first');

  let shiftPatternId = req.body && req.body.shift_pattern_id;
  if (!shiftPatternId) {
    const standard = await db.query(`SELECT id FROM shift_pattern WHERE name = 'Standard day' LIMIT 1`);
    shiftPatternId = standard[0] ? standard[0].id : null;
  }

  const result = await db.query(
    `INSERT INTO work_timer (employee_no, shift_pattern_id, clock_in, source, device) VALUES (?, ?, NOW(), 'web', 'Browser')`,
    [req.session.user.employeeNo, shiftPatternId]
  );
  await writeAudit(req, 'create', 'work_timer', result.insertId, null, { clock_in: 'now' });
  res.status(201).json({ data: { id: result.insertId } });
}));

router.post('/clock-out', requireScope('attendance', 'update'), asyncHandler(async (req, res) => {
  const open = await db.query(
    `SELECT id FROM work_timer WHERE employee_no = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
    [req.session.user.employeeNo]
  );
  if (!open[0]) throw notFound('No open timer to clock out of');

  await db.query('UPDATE work_timer SET clock_out = NOW() WHERE id = ?', [open[0].id]);
  await writeAudit(req, 'update', 'work_timer', open[0].id, open[0], { clock_out: 'now' });
  res.json({ ok: true });
}));

router.post('/timers/:id/correction', requireScope('attendance', 'update'), asyncHandler(async (req, res) => {
  const { clock_in, clock_out, reason } = req.body || {};
  if (!clock_in) throw badRequest('clock_in is required for a correction');

  const original = await db.query('SELECT * FROM work_timer WHERE id = ?', [req.params.id]);
  if (!original[0]) throw notFound('Original timer not found');

  const result = await db.query(
    `INSERT INTO work_timer (employee_no, shift_pattern_id, clock_in, clock_out, source, device, correction_of)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [original[0].employee_no, original[0].shift_pattern_id, clock_in, clock_out || null, original[0].source, 'Correction', req.params.id]
  );
  await writeAudit(req, 'create', 'work_timer', result.insertId, original[0], { clock_in, clock_out, reason: reason || null, correction_of: req.params.id });
  res.status(201).json({ data: { id: result.insertId } });
}));

module.exports = router;

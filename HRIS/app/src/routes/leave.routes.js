const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { notify } = require('../platform/mailer');
const { leaveRequestSchema, decideSchema, leaveTypeSchema } = require('../validators/leave.validators');

const router = express.Router();

const ER_ROW_IS_REFERENCED = 1451;

router.get('/types', requireScope('leave', 'read'), asyncHandler(async (req, res) => {
  const data = await db.query('SELECT * FROM leave_type ORDER BY name');
  res.json({ data });
}));

router.post('/types', requireScope('leave', 'create'), asyncHandler(async (req, res) => {
  const parsed = leaveTypeSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid leave type data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO leave_type (name, annual_entitlement_days, paid) VALUES (?, ?, ?)',
    [d.name, d.annual_entitlement_days ?? 0, d.paid === false ? 0 : 1]
  );
  await writeAudit(req, 'create', 'leave_type', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/types/:id', requireScope('leave', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM leave_type WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Leave type not found');
  const parsed = leaveTypeSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid leave type data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  const values = fields.map((f) => (f === 'paid' ? (d[f] ? 1 : 0) : d[f]));
  await db.query(`UPDATE leave_type SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...values, req.params.id]);
  await writeAudit(req, 'update', 'leave_type', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM leave_type WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/types/:id', requireScope('leave', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM leave_type WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Leave type not found');
  try {
    await db.query('DELETE FROM leave_type WHERE id = ?', [req.params.id]);
  } catch (err) {
    if (err.errno === ER_ROW_IS_REFERENCED) throw conflict('This leave type has balances or requests recorded against it and cannot be deleted.');
    throw err;
  }
  await writeAudit(req, 'delete', 'leave_type', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.get('/balances', requireScope('leave', 'read'), asyncHandler(async (req, res) => {
  const target = req.query.employee_no || req.session.user.employeeNo;
  const filter = await scopeFilterSql(req.scope, req.session.user, 'lb.employee_no');
  const data = await db.query(
    `SELECT lb.*, lt.name AS leave_type
     FROM leave_balance lb JOIN leave_type lt ON lt.id = lb.leave_type_id
     WHERE lb.employee_no = ? AND lb.year = YEAR(CURDATE()) AND ${filter.clause}
     ORDER BY lt.name`,
    [target, ...filter.params]
  );
  res.json({ data, meta: { scope: scopeMeta(req.scope) } });
}));

// Manual balance adjustment — a correction tool for HR/managers (e.g. carry-over, an error fix),
// distinct from the automatic used_days increment that happens when a request is approved.
router.put('/balances/:id', requireScope('leave', 'update'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const before = await db.query(`SELECT * FROM leave_balance WHERE id = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!before[0]) throw notFound('Balance not found or out of scope');

  const entitled = req.body && req.body.entitled_days !== undefined ? Number(req.body.entitled_days) : undefined;
  const used = req.body && req.body.used_days !== undefined ? Number(req.body.used_days) : undefined;
  if (entitled === undefined && used === undefined) throw badRequest('Nothing to update');
  if ((entitled !== undefined && Number.isNaN(entitled)) || (used !== undefined && Number.isNaN(used))) throw badRequest('Invalid number');

  const setClauses = [];
  const params = [];
  if (entitled !== undefined) { setClauses.push('entitled_days = ?'); params.push(entitled); }
  if (used !== undefined) { setClauses.push('used_days = ?'); params.push(used); }
  params.push(req.params.id);

  await db.query(`UPDATE leave_balance SET ${setClauses.join(', ')} WHERE id = ?`, params);
  await writeAudit(req, 'update', 'leave_balance', req.params.id, before[0], req.body);
  const after = await db.query('SELECT * FROM leave_balance WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

// All of one person's balances (any leave type, current year) — used by the balance-adjustment
// drawer, which looks a person up then lets HR/a manager correct any of their types in one place.
router.get('/balances/for/:employeeNo', requireScope('leave', 'update'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'lb.employee_no');
  const data = await db.query(
    `SELECT lb.*, lt.name AS leave_type
     FROM leave_balance lb JOIN leave_type lt ON lt.id = lb.leave_type_id
     WHERE lb.employee_no = ? AND lb.year = YEAR(CURDATE()) AND ${filter.clause}
     ORDER BY lt.name`,
    [req.params.employeeNo, ...filter.params]
  );
  res.json({ data });
}));

router.get('/requests', requireScope('leave', 'read'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'lr.employee_no');
  const params = [...filter.params];
  let sql = `SELECT lr.*, lt.name AS leave_type, p.full_legal_name
             FROM leave_request lr
             JOIN leave_type lt ON lt.id = lr.leave_type_id
             JOIN person p ON p.employee_no = lr.employee_no
             WHERE ${filter.clause}`;
  if (req.query.employee_no) { sql += ' AND lr.employee_no = ?'; params.push(req.query.employee_no); }
  if (req.query.status) { sql += ' AND lr.status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY lr.created_at DESC';

  const data = await db.query(sql, params);
  res.json({ data, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/requests', requireScope('leave', 'create'), asyncHandler(async (req, res) => {
  const parsed = leaveRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid leave request', parsed.error.flatten());
  const d = parsed.data;

  const employeeNo = d.employee_no && req.scope.dataScope !== 'self' ? d.employee_no : req.session.user.employeeNo;

  const result = await db.query(
    `INSERT INTO leave_request (employee_no, leave_type_id, start_date, end_date, days, reason, stage, status)
     VALUES (?, ?, ?, ?, ?, ?, 'manager', 'pending')`,
    [employeeNo, d.leave_type_id, d.start_date, d.end_date, d.days, d.reason || null]
  );

  const rows = await db.query(
    `SELECT p.full_legal_name, lt.name AS leave_type, e.reports_to_employee_no
     FROM person p
     JOIN leave_type lt ON lt.id = ?
     LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
     WHERE p.employee_no = ?`,
    [d.leave_type_id, employeeNo]
  );
  if (rows[0] && rows[0].reports_to_employee_no) {
    const mgr = await db.query('SELECT email FROM person WHERE employee_no = ?', [rows[0].reports_to_employee_no]);
    if (mgr[0]) await notify.leaveSubmitted(mgr[0].email, rows[0].full_legal_name, d.days, rows[0].leave_type);
  }

  await writeAudit(req, 'create', 'leave_request', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/requests/:id/decide', requireScope('leave', 'update'), asyncHandler(async (req, res) => {
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid decision', parsed.error.flatten());
  const { status } = parsed.data;

  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const before = await db.query(`SELECT * FROM leave_request WHERE id = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!before[0]) throw notFound('Leave request not found or out of scope');

  await db.query(
    `UPDATE leave_request SET status = ?, decided_by_employee_no = ?, decided_at = NOW(), stage = 'completed' WHERE id = ?`,
    [status, req.session.user.employeeNo, req.params.id]
  );

  if (status === 'approved') {
    await db.query(
      `UPDATE leave_balance SET used_days = used_days + ? WHERE employee_no = ? AND leave_type_id = ? AND year = YEAR(?)`,
      [before[0].days, before[0].employee_no, before[0].leave_type_id, before[0].start_date]
    );
  }

  const rows = await db.query(
    `SELECT p.full_legal_name, p.email, lt.name AS leave_type FROM person p JOIN leave_type lt ON lt.id = ? WHERE p.employee_no = ?`,
    [before[0].leave_type_id, before[0].employee_no]
  );
  if (rows[0]) await notify.leaveDecided(rows[0].email, rows[0].full_legal_name, status, rows[0].leave_type);

  await writeAudit(req, 'update', 'leave_request', req.params.id, before[0], { status });
  res.json({ ok: true });
}));

module.exports = router;

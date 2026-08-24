const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { enrollmentSchema, planSchema } = require('../validators/benefits.validators');

const router = express.Router();

router.get('/plans', requireScope('benefits', 'read'), asyncHandler(async (req, res) => {
  const data = await db.query('SELECT * FROM benefit_plan ORDER BY name');
  res.json({ data, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/plans', requireScope('benefits', 'create'), asyncHandler(async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid plan data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO benefit_plan (name, kind, cost_per_person, note) VALUES (?, ?, ?, ?)',
    [d.name, d.kind || null, d.cost_per_person ?? 0, d.note || null]
  );
  await writeAudit(req, 'create', 'benefit_plan', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/plans/:id', requireScope('benefits', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM benefit_plan WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Benefit plan not found');
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid plan data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE benefit_plan SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'benefit_plan', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM benefit_plan WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/plans/:id', requireScope('benefits', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM benefit_plan WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Benefit plan not found');
  await db.query('DELETE FROM benefit_plan WHERE id = ?', [req.params.id]); // benefit_enrollment cascades
  await writeAudit(req, 'delete', 'benefit_plan', req.params.id, before[0], null);
  res.json({ ok: true });
}));

// All (in-scope) enrollees for one plan — powers the "manage enrollees" drawer, as opposed to
// GET /enrollments which is always employee_no-scoped (defaults to self).
router.get('/plans/:id/enrollees', requireScope('benefits', 'read'), asyncHandler(async (req, res) => {
  const plan = await db.query('SELECT id FROM benefit_plan WHERE id = ?', [req.params.id]);
  if (!plan[0]) throw notFound('Benefit plan not found');
  const filter = await scopeFilterSql(req.scope, req.session.user, 'be.employee_no');
  const data = await db.query(
    `SELECT be.id, be.employee_no, be.enrolled_at, p.full_legal_name
     FROM benefit_enrollment be JOIN person p ON p.employee_no = be.employee_no
     WHERE be.benefit_plan_id = ? AND be.status = 'active' AND ${filter.clause}
     ORDER BY p.full_legal_name`,
    [req.params.id, ...filter.params]
  );
  res.json({ data });
}));

router.get('/enrollments', requireScope('benefits', 'read'), asyncHandler(async (req, res) => {
  const target = req.query.employee_no || req.session.user.employeeNo;
  const filter = await scopeFilterSql(req.scope, req.session.user, 'be.employee_no');
  const data = await db.query(
    `SELECT be.*, bp.name AS plan_name, bp.kind, bp.cost_per_person
     FROM benefit_enrollment be JOIN benefit_plan bp ON bp.id = be.benefit_plan_id
     WHERE be.employee_no = ? AND be.status = 'active' AND ${filter.clause}
     ORDER BY bp.name`,
    [target, ...filter.params]
  );
  res.json({ data, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/enrollments', requireScope('benefits', 'create'), asyncHandler(async (req, res) => {
  const parsed = enrollmentSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid enrollment data', parsed.error.flatten());
  const d = parsed.data;
  const employeeNo = d.employee_no && req.scope.dataScope !== 'self' ? d.employee_no : req.session.user.employeeNo;

  const result = await db.query(
    `INSERT INTO benefit_enrollment (employee_no, benefit_plan_id, enrolled_at, status) VALUES (?, ?, CURDATE(), 'active')`,
    [employeeNo, d.benefit_plan_id]
  );
  await writeAudit(req, 'create', 'benefit_enrollment', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.delete('/enrollments/:id', requireScope('benefits', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM benefit_enrollment WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Enrollment not found');
  await db.query(`UPDATE benefit_enrollment SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
  await writeAudit(req, 'update', 'benefit_enrollment', req.params.id, before[0], { status: 'cancelled' });
  res.json({ ok: true });
}));

module.exports = router;
